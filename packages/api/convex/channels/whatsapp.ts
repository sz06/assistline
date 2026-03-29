import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, internalMutation } from "../_generated/server";
import {
  resolveSelfPuppetId,
  sleep,
} from "./utils";

/** Set the WhatsApp pairing code in channelData. */
export const internalSetPairingCode = internalMutation({
  args: {
    id: v.id("channels"),
    pairingCode: v.string(),
  },
  handler: async (ctx, args) => {
    const ch = await ctx.db.get(args.id);
    if (!ch) throw new Error("Channel not found");
    const base = ch.channelData ?? { type: ch.type as "whatsapp" };
    await ctx.db.patch(args.id, {
      channelData:
        base.type === "whatsapp"
          ? { ...base, pairingCode: args.pairingCode }
          : base, // WA-only field; no-op for other types
      updatedAt: Date.now(),
    });
  },
});

const PAIRING_POLL_INTERVAL_MS = 3000;
const PAIRING_TIMEOUT_POLLS = 20; // 60 seconds to get pairing code
const CONNECTION_TIMEOUT_POLLS = 36; // 3 minutes to scan (at 5s interval)

export const startWhatsAppPairing = internalAction({
  args: { channelId: v.id("channels"), phoneNumber: v.string() },
  handler: async (ctx, args) => {
    const homeserver =
      process.env.MATRIX_HOMESERVER_URL ?? "http://localhost:8008";
    // Public URL the browser can reach (Docker-internal hostname won't resolve in the browser)
    const publicHomeserver =
      process.env.MATRIX_PUBLIC_URL ?? "http://localhost:8008";
    const botUser = process.env.MATRIX_BOT_USERNAME ?? "listener-bot";
    const botPassword = process.env.MATRIX_BOT_PASSWORD ?? "";
    const serverName = process.env.DENDRITE_SERVER_NAME ?? "matrix.local";
    const botUserId = `@${botUser}:${serverName}`;

    console.log(
      `[pairing] Starting WhatsApp pairing for channel ${args.channelId}`,
    );
    console.log(`[pairing] Homeserver: ${homeserver}, Bot: ${botUserId}`);

    try {
      // ── Step 1: Login as bot ───────────────────────────────────
      const loginRes = await fetch(`${homeserver}/_matrix/client/v3/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "m.login.password",
          identifier: { type: "m.id.user", user: botUser },
          password: botPassword,
        }),
      });

      if (!loginRes.ok) {
        const err = await loginRes.text();
        throw new Error(`Matrix login failed: ${err}`);
      }

      const loginData = (await loginRes.json()) as {
        access_token: string;
      };
      const token = loginData.access_token;
      console.log("[pairing] ✓ Logged in as bot");

      const matrixFetch = (path: string, init?: RequestInit) =>
        fetch(`${homeserver}${path}`, {
          ...init,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...init?.headers,
          },
        });

      // ── Step 2: Create DM with @whatsappbot ────────────────────
      const bridgeBot = `@whatsappbot:${serverName}`;
      const roomRes = await matrixFetch("/_matrix/client/v3/createRoom", {
        method: "POST",
        body: JSON.stringify({
          invite: [bridgeBot],
          is_direct: true,
          preset: "trusted_private_chat",
        }),
      });

      if (!roomRes.ok) {
        const err = await roomRes.text();
        throw new Error(`Failed to create room: ${err}`);
      }

      const roomData = (await roomRes.json()) as { room_id: string };
      const roomId = roomData.room_id;
      console.log(`[pairing] ✓ Created DM room: ${roomId}`);

      // Small delay to let the bridge bot join
      await sleep(2000);

      // ── Step 3a: Log out of any existing session first ─────────
      // When re-pairing (e.g. after BAD_CREDENTIALS), the bridge
      // still holds the old session. Sending logout first clears it.
      // The bridge requires: !wa logout <loginID> (phone digits)
      const channel = await ctx.runQuery(internal.channels.core.internalGet, {
        id: args.channelId,
      });
      const waData =
        channel?.channelData?.type === "whatsapp"
          ? channel.channelData
          : undefined;
      const loginId = waData?.phoneNumber?.replace(/\D/g, "");

      if (loginId) {
        const logoutTxnId = `logout_${Date.now()}`;
        const logoutRes = await matrixFetch(
          `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${logoutTxnId}`,
          {
            method: "PUT",
            body: JSON.stringify({
              msgtype: "m.text",
              body: `!wa logout ${loginId}`,
            }),
          },
        );

        if (logoutRes.ok) {
          console.log(
            `[pairing] ✓ Sent '!wa logout ${loginId}' (clearing old session)`,
          );
          // Give the bridge time to process the logout
          await sleep(3000);
        }
      }

      // ── Step 3b: Send "login <phone>" command ────────────────────────
      const txnId = `pair_${Date.now()}`;
      const sendRes = await matrixFetch(
        `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            msgtype: "m.text",
            body: `!wa login ${args.phoneNumber}`,
          }),
        },
      );

      if (!sendRes.ok) {
        const err = await sendRes.text();
        throw new Error(`Failed to send login command: ${err}`);
      }
      console.log(`[pairing] ✓ Sent '!wa login ${args.phoneNumber}' command`);

      // ── Step 4: Poll for Pairing Code ───────────────────────────────
      console.log("[pairing] Polling for pairing code from bridge…");
      let pairingCode: string | null = null;

      for (let i = 0; i < PAIRING_TIMEOUT_POLLS; i++) {
        await sleep(PAIRING_POLL_INTERVAL_MS);

        const messagesRes = await matrixFetch(
          `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=10`,
        );

        if (!messagesRes.ok) continue;

        const messagesData = (await messagesRes.json()) as {
          chunk: Array<{
            sender: string;
            content: { body?: string };
          }>;
        };

        for (const event of messagesData.chunk ?? []) {
          // Skip our own messages
          if (event.sender === botUserId) continue;

          // Look for pairing code in the bridge bot's text response
          const text = event.content?.body || "";
          
          // Mautrix-WhatsApp usually sends a message like:
          // "Your pairing code is 1234-5678" or similar.
          // We look for an 8 character alphanumeric code.
          const codeMatch = text.match(/([A-Z0-9]{4}-[A-Z0-9]{4})/i);
          if (codeMatch && text.toLowerCase().includes("code")) {
            pairingCode = codeMatch[1].toUpperCase();
            break;
          }
        }

        if (pairingCode) break;
      }

      if (!pairingCode) {
        throw new Error(
          "Timed out waiting for pairing code from bridge bot. Make sure the phone number is correct and Mautrix is running.",
        );
      }

      console.log(`[pairing] ✓ Got pairing code: ${pairingCode}`);

      // Write Pairing Code to the channel
      await ctx.runMutation(internal.channels.whatsapp.internalSetPairingCode, {
        id: args.channelId,
        pairingCode,
      });

      // ── Step 5: Poll for connection confirmation ───────────────
      console.log("[pairing] Waiting for user to enter code in WhatsApp app…");

      for (let i = 0; i < CONNECTION_TIMEOUT_POLLS; i++) {
        await sleep(5000); // 5s poll interval

        const messagesRes = await matrixFetch(
          `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=10`,
        );

        if (!messagesRes.ok) continue;

        const messagesData = (await messagesRes.json()) as {
          chunk: Array<{
            sender: string;
            content: { body?: string; msgtype?: string };
          }>;
        };

        for (const event of messagesData.chunk ?? []) {
          if (event.sender === botUserId) continue;

          const body = event.content?.body?.toLowerCase() ?? "";

          // Bridge sends "Successfully logged in" when connected
          if (
            body.includes("successfully logged in") ||
            body.includes("logged in as")
          ) {
            console.log("[pairing] ✓ WhatsApp connected!");

            // Try to extract phone number from the bridge success message
            const phoneMatch = event.content?.body?.match(/\+[\d\s-]+/);
            const phoneNumber = phoneMatch?.[0]?.trim();
            const selfPuppetId = await resolveSelfPuppetId({
              platform: "whatsapp",
              serverName,
              userMxid: botUserId,
            });

            await ctx.runMutation(internal.channels.core.internalSetConnected, {
              id: args.channelId,
              channelData: { type: "whatsapp", phoneNumber },
              selfPuppetId,
            });
            return;
          }

          // Check for errors/timeouts from bridge
          if (
            body.includes("login timed out") ||
            body.includes("failed to log in")
          ) {
            throw new Error("WhatsApp login timed out or failed");
          }
        }
      }

      // If we get here, the user never entered the pairing code
      throw new Error("Pairing timed out — code was not entered");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown pairing error";
      console.error(`[pairing] ✗ ${message}`);

      // If the channel was previously connected (has connectedAt), don't clobber
      // its status with an error — restore it to connected instead. This prevents
      // a QR timeout on a re-pair attempt from breaking an otherwise working channel.
      const existingChannel = await ctx.runQuery(
        internal.channels.core.internalGet,
        { id: args.channelId },
      );
      const existingWaData =
        existingChannel?.channelData?.type === "whatsapp"
          ? existingChannel.channelData
          : undefined;
      if (existingChannel?.connectedAt && existingWaData?.phoneNumber) {
        console.warn(
          `[pairing] Channel was previously connected — restoring to 'connected' instead of 'error'`,
        );
        await ctx.runMutation(internal.channels.core.internalSetConnected, {
          id: args.channelId,
          channelData: existingWaData,
          selfPuppetId: existingChannel.selfPuppetId,
        });
      } else {
        await ctx.runMutation(internal.channels.core.internalSetError, {
          id: args.channelId,
          error: message,
        });
      }
    }
  },
});
