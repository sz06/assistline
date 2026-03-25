/// <reference types="node" />
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

// ---------------------------------------------------------------------------
// WhatsApp Pairing Action
//
// Triggered when a channel enters "pairing" status. This action:
//   1. Logs into Dendrite as the bot user
//   2. Creates a DM room with @whatsappbot
//   3. Sends "login qr"
//   4. Polls for the QR code image and writes it to the channel
//   5. Polls for connection confirmation
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 2000;
const QR_POLL_INTERVAL_MS = 5000; // Slower polling once QR is displayed (avoids UI flicker)
const QR_TIMEOUT_POLLS = 30; // 60 seconds to get QR code
const CONNECTION_TIMEOUT_POLLS = 36; // 3 minutes to scan (at 5s interval)

export const startWhatsAppPairing = internalAction({
  args: { channelId: v.id("channels") },
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
      const channel = await ctx.runQuery(internal.channels.internalGet, {
        id: args.channelId,
      });
      const loginId = channel?.phoneNumber?.replace(/\D/g, "");

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

      // ── Step 3b: Send "login qr" command ────────────────────────
      const txnId = `pair_${Date.now()}`;
      const sendRes = await matrixFetch(
        `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            msgtype: "m.text",
            body: "!wa login qr",
          }),
        },
      );

      if (!sendRes.ok) {
        const err = await sendRes.text();
        throw new Error(`Failed to send login command: ${err}`);
      }
      console.log("[pairing] ✓ Sent '!wa login qr' command");

      // ── Step 4: Poll for QR code ───────────────────────────────
      console.log("[pairing] Polling for QR code…");
      let qrImageUrl: string | null = null;

      for (let i = 0; i < QR_TIMEOUT_POLLS; i++) {
        await sleep(POLL_INTERVAL_MS);

        const messagesRes = await matrixFetch(
          `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=10`,
        );

        if (!messagesRes.ok) continue;

        const messagesData = (await messagesRes.json()) as {
          chunk: Array<{
            type: string;
            sender: string;
            content: {
              msgtype?: string;
              body?: string;
              url?: string;
              info?: { mimetype?: string };
            };
          }>;
        };

        for (const event of messagesData.chunk ?? []) {
          // Skip our own messages
          if (event.sender === botUserId) continue;

          // Look for QR code image from bridge bot
          if (event.content?.msgtype === "m.image" && event.content?.url) {
            // Convert mxc:// URL to HTTP URL
            const mxcUrl = event.content.url;
            const match = mxcUrl.match(/^mxc:\/\/([^/]+)\/(.+)$/);
            if (match) {
              qrImageUrl = `${publicHomeserver}/_matrix/media/v3/download/${match[1]}/${match[2]}`;
              break;
            }
          }
        }

        if (qrImageUrl) break;
      }

      if (!qrImageUrl) {
        throw new Error(
          "Timed out waiting for QR code from bridge bot. Make sure mautrix-whatsapp is running.",
        );
      }

      console.log(`[pairing] ✓ Got QR code image`);

      // Write QR code URL to the channel
      await ctx.runMutation(internal.channels.internalSetQrCode, {
        id: args.channelId,
        qrCode: qrImageUrl,
      });

      // ── Step 5: Poll for connection confirmation ───────────────
      console.log("[pairing] Waiting for user to scan QR code…");

      for (let i = 0; i < CONNECTION_TIMEOUT_POLLS; i++) {
        await sleep(QR_POLL_INTERVAL_MS);

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

            // Try to extract phone number from the message
            const phoneMatch = event.content?.body?.match(/\+[\d\s-]+/);

            await ctx.runMutation(internal.channels.internalSetConnected, {
              id: args.channelId,
              phoneNumber: phoneMatch?.[0]?.trim(),
            });
            return;
          }

          // Check for new QR codes (they refresh every ~20s)
          if (
            event.content?.msgtype === "m.image" &&
            (event.content as { url?: string }).url
          ) {
            const mxcUrl = (event.content as { url: string }).url;
            const match = mxcUrl.match(/^mxc:\/\/([^/]+)\/(.+)$/);
            if (match) {
              const newQrUrl = `${publicHomeserver}/_matrix/media/v3/download/${match[1]}/${match[2]}`;
              if (newQrUrl !== qrImageUrl) {
                qrImageUrl = newQrUrl;
                await ctx.runMutation(internal.channels.internalSetQrCode, {
                  id: args.channelId,
                  qrCode: newQrUrl,
                });
                console.log("[pairing] ↻ QR code refreshed");
              }
            }
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

      // If we get here, the user never scanned
      throw new Error("Pairing timed out — QR code was not scanned");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown pairing error";
      console.error(`[pairing] ✗ ${message}`);
      await ctx.runMutation(internal.channels.internalSetError, {
        id: args.channelId,
        error: message,
      });
    }
  },
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
