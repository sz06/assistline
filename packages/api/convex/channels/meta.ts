import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  internalAction,
  internalMutation,
  mutation,
} from "../_generated/server";
import {
  META_PROVISION_URL,
  provisionAuth,
  resolveSelfPuppetId,
  sleep,
} from "./utils";

/** Store the Meta bridge login session data (loginId, accessToken, instructions) in channelData. */
export const internalSetMetaBotRoomId = internalMutation({
  args: {
    id: v.id("channels"),
    roomId: v.string(),
    accessToken: v.string(),
    instructions: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ch = await ctx.db.get(args.id);
    if (!ch) throw new Error("Channel not found");
    const base =
      ch.channelData?.type === "facebook" ||
      ch.channelData?.type === "instagram"
        ? ch.channelData
        : { type: ch.type as "facebook" | "instagram" };
    await ctx.db.patch(args.id, {
      channelData: {
        ...base,
        loginId: args.roomId,
        accessToken: args.accessToken,
        ...(args.instructions !== undefined
          ? { instructions: args.instructions }
          : {}),
      },
      updatedAt: Date.now(),
    });
  },
});

/** Submit cookies to the Meta bridge bot to complete login. */
export const submitMetaCookies = mutation({
  args: {
    id: v.id("channels"),
    cookies: v.string(),
  },
  handler: async (ctx, args) => {
    const channel = await ctx.db.get(args.id);
    if (!channel) throw new Error("Channel not found");
    const loginId =
      channel.channelData?.type === "facebook" ||
      channel.channelData?.type === "instagram"
        ? channel.channelData.loginId
        : undefined;
    if (!loginId)
      throw new Error(
        "No Meta login session found — try connecting again from the dashboard.",
      );

    await ctx.scheduler.runAfter(
      0,
      internal.channels.meta.sendMetaCookiesAction,
      { channelId: args.id, cookies: args.cookies },
    );
  },
});

const META_POLL_INTERVAL_MS = 3000;
const META_LOGIN_TIMEOUT = 120; // polls × 3 s = 6 min

export const startMetaPairing = internalAction({
  args: { channelId: v.id("channels") },
  handler: async (ctx, args) => {
    const serverName = process.env.DENDRITE_SERVER_NAME ?? "matrix.local";
    const botUser = process.env.MATRIX_BOT_USERNAME ?? "listener-bot";
    const userMxid = `@${botUser}:${serverName}`;

    const channel = await ctx.runQuery(internal.channels.core.internalGet, {
      id: args.channelId,
    });
    if (!channel) throw new Error("Channel not found");

    const network = channel.type === "instagram" ? "instagram" : "messenger";

    console.log(
      `[meta-pairing] Starting Meta pairing via provisioning API for ${args.channelId} (${network})`,
    );

    try {
      // Start login process via provisioning API
      const startRes = await fetch(
        `${META_PROVISION_URL}/_matrix/provision/v3/login/start/${network}?user_id=${encodeURIComponent(userMxid)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: provisionAuth(),
          },
          body: JSON.stringify({}),
        },
      );
      if (!startRes.ok) {
        const err = await startRes.text();
        throw new Error(`Provisioning API login/start failed: ${err}`);
      }

      const startData = (await startRes.json()) as {
        login_id: string;
        type: string;
        step_id: string;
        instructions: string;
      };

      const loginId = startData.login_id;
      const instructionText =
        startData.instructions ||
        "Enter a JSON object with your cookies, or a cURL command copied from browser devtools.";

      console.log(
        `[meta-pairing] ✓ Login process started. login_id=${loginId}`,
      );

      // Persist login_id + instructions in one write
      await ctx.runMutation(internal.channels.meta.internalSetMetaBotRoomId, {
        id: args.channelId,
        roomId: loginId,
        accessToken: "",
        instructions: instructionText,
      });

      console.log(
        "[meta-pairing] ✓ Ready for user cookie submission. Phase 1 complete.",
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown pairing error";
      console.error(`[meta-pairing] ✗ ${message}`);
      await ctx.runMutation(internal.channels.core.internalSetError, {
        id: args.channelId,
        error: message,
      });
    }
  },
});

/**
 * Parse a raw cURL command (or a cookie string) and extract the
 * provided cookie names into an object.
 * Handles both `-b 'k=v; k=v'` and `--cookie 'k=v; k=v'` flags.
 * Falls back to treating the input as a bare cookie string if no cURL flag found.
 */
function parseCurlCookies(
  input: string,
  keys: string[],
): Record<string, string> {
  // Try to extract the -b / --cookie value from the cURL command
  let cookieStr = input;

  const cookieFlagMatch = input.match(/(?:-b|--cookie)\s+['"]([^'"]+)['"]/);
  if (cookieFlagMatch) {
    cookieStr = cookieFlagMatch[1];
  }

  // URL-decode the cookie string in case values are percent-encoded
  try {
    cookieStr = decodeURIComponent(cookieStr);
  } catch {
    // leave as-is if decode fails
  }

  // Parse semicolon-separated key=value pairs
  const result: Record<string, string> = {};
  for (const pair of cookieStr.split(";")) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    const k = pair.slice(0, eqIdx).trim();
    const v = pair.slice(eqIdx + 1).trim();
    if (keys.includes(k)) {
      result[k] = v;
    }
  }
  return result;
}

export const sendMetaCookiesAction = internalAction({
  args: { channelId: v.id("channels"), cookies: v.string() },
  handler: async (ctx, args) => {
    const serverName = process.env.DENDRITE_SERVER_NAME ?? "matrix.local";
    const botUser = process.env.MATRIX_BOT_USERNAME ?? "listener-bot";
    const userMxid = `@${botUser}:${serverName}`;

    const channel = await ctx.runQuery(internal.channels.core.internalGet, {
      id: args.channelId,
    });
    const metaData =
      channel?.channelData?.type === "facebook" ||
      channel?.channelData?.type === "instagram"
        ? channel.channelData
        : undefined;
    if (!metaData?.loginId) {
      await ctx.runMutation(internal.channels.core.internalSetError, {
        id: args.channelId,
        error: "No active login session — click Connect again to restart.",
      });
      return;
    }

    const loginId = metaData.loginId;
    const network = channel!.type;

    // Determine which cookies to extract based on the network type
    const cookieKeys =
      network === "instagram"
        ? ["sessionid", "csrftoken", "mid", "ig_did", "ds_user_id"]
        : ["xs", "c_user", "datr", "sb", "fr"];

    // Parse cookies out of the raw cURL (or bare cookie string)
    const parsed = parseCurlCookies(args.cookies, cookieKeys);

    // Check required cookies are present
    const requiredKeys =
      network === "instagram"
        ? ["sessionid", "csrftoken", "mid"]
        : ["xs", "c_user", "datr"];

    const missing = requiredKeys.filter((k) => !parsed[k]);
    if (missing.length > 0) {
      await ctx.runMutation(internal.channels.core.internalSetError, {
        id: args.channelId,
        error: `Could not extract required cookies: ${missing.join(", ")}. Make sure you copied the full cURL from ${network === "instagram" ? "instagram.com" : "messenger.com"}.`,
      });
      return;
    }

    console.log(
      `[meta-cookies] Submitting cookies to login_id=${loginId} for ${args.channelId}`,
      `keys=${Object.keys(parsed).join(",")}`,
    );

    try {
      // The bridge provisioning API expects cookie field IDs at the top level of the JSON body.
      // e.g. { "xs": "...", "c_user": "...", "datr": "..." }

      // POST parsed cookie fields to provisioning API step
      const stepUrl = `${META_PROVISION_URL}/_matrix/provision/v3/login/step/${loginId}/fi.mau.meta.cookies/cookies?user_id=${encodeURIComponent(userMxid)}`;
      const stepRes = await fetch(stepUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: provisionAuth(),
        },
        body: JSON.stringify(parsed),
      });

      const stepText = await stepRes.text();
      console.log(
        `[meta-cookies] Provisioning API response (${stepRes.status}): ${stepText.slice(0, 300)}`,
      );

      if (!stepRes.ok) {
        throw new Error(
          `Cookie submission failed (${stepRes.status}): ${stepText}`,
        );
      }

      const stepData = JSON.parse(stepText) as {
        type?: string;
        message?: string;
      };

      // type==="complete" or no "type" field → immediate success
      if (stepData.type === "complete" || !stepData.type) {
        console.log(
          `[meta-cookies] ✓ Meta (${network}) connected via provisioning API!`,
        );
        const selfPuppetId = await resolveSelfPuppetId({
          platform: network as "facebook" | "instagram",
          serverName,
          userMxid,
        });
        await ctx.runMutation(internal.channels.core.internalSetConnected, {
          id: args.channelId,
          selfPuppetId,
          channelData: { type: network as "facebook" | "instagram" },
        });
        return;
      }

      // Another step → poll /v3/login/logins for connection status
      console.log(
        `[meta-cookies] Next step type=${stepData.type}, polling for completion…`,
      );

      for (let i = 0; i < META_LOGIN_TIMEOUT; i++) {
        await sleep(META_POLL_INTERVAL_MS);

        const loginsRes = await fetch(
          `${META_PROVISION_URL}/_matrix/provision/v3/login/logins?user_id=${encodeURIComponent(userMxid)}`,
          { headers: { Authorization: provisionAuth() } },
        );
        if (!loginsRes.ok) continue;

        const loginsData = (await loginsRes.json()) as {
          logins?: Array<{ is_connected?: boolean }>;
        };
        const isConnected = loginsData.logins?.some(
          (l) => l.is_connected === true,
        );

        if (isConnected) {
          console.log(`[meta-cookies] ✓ Meta (${network}) connected!`);
          const selfPuppetId = await resolveSelfPuppetId({
            platform: network as "facebook" | "instagram",
            serverName,
            userMxid,
          });
          await ctx.runMutation(internal.channels.core.internalSetConnected, {
            id: args.channelId,
            selfPuppetId,
            channelData: { type: network as "facebook" | "instagram" },
          });
          return;
        }
      }

      throw new Error(
        "Login confirmation timed out — check your cookies and try again.",
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[meta-cookies] ✗ ${message}`);
      await ctx.runMutation(internal.channels.core.internalSetError, {
        id: args.channelId,
        error: message,
      });
    }
  },
});
