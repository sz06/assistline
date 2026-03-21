import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, internalMutation } from "./_generated/server";

/**
 * Send a read receipt to the Matrix homeserver so the bridge forwards it
 * to WhatsApp. This makes messages appear as "read" (blue checkmarks) on
 * the contact's phone when the user views them in the dashboard.
 *
 * The action reads the bot access token from the `config` table (persisted
 * by the listener on startup) and calls the Matrix receipt API.
 */
export const sendReadReceipt = action({
  args: {
    matrixRoomId: v.string(),
    eventId: v.string(),
  },
  handler: async (ctx, args) => {
    // Read connection details from config (stored by listener on startup)
    const homeserver = (await ctx.runQuery(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "config:get" as any,
      { key: "matrix_homeserver_url" },
    )) as string | null;

    const token = (await ctx.runQuery(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "config:get" as any,
      { key: "matrix_bot_access_token" },
    )) as string | null;

    if (!homeserver || !token) {
      console.warn(
        "[readReceipt] Missing Matrix config — skipping read receipt",
      );
      return;
    }

    const url = `${homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(args.matrixRoomId)}/receipt/m.read/${encodeURIComponent(args.eventId)}`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      });

      if (!res.ok) {
        const body = await res.text();
        console.error(`[readReceipt] Matrix API error: ${res.status} ${body}`);
      } else {
        console.log(
          `[readReceipt] ✓ Sent read receipt: ${args.matrixRoomId} → ${args.eventId}`,
        );
      }
    } catch (err) {
      console.error(
        "[readReceipt] Failed to send:",
        err instanceof Error ? err.message : err,
      );
    }
  },
});

// ---------------------------------------------------------------------------
// Send an outbound message to a Matrix room
// ---------------------------------------------------------------------------
//
// OUTGOING MESSAGE JOURNEY (this is the second half of the flow):
//
//   Dashboard UI
//       │  calls sendMessage mutation (messages.ts)
//       ▼
//   Convex DB
//       │  message saved with placeholder eventId ("outbound_<ts>")
//       │  conversation updated, audit logged
//       │  scheduler fires sendMatrixMessage (THIS action) ← you are here
//       ▼
//   Dendrite (Matrix homeserver, Docker container)
//       │  PUT /_matrix/client/v3/rooms/{roomId}/send/m.room.message/{txnId}
//       │  Dendrite creates a Matrix event and distributes it to all room members
//       ▼
//   mautrix-whatsapp / mautrix-telegram (bridge bot, also in the room)
//       │  Bridge receives the Matrix event via /sync
//       │  Converts it to the native WhatsApp/Telegram protocol
//       ▼
//   Contact's phone (WhatsApp / Telegram app)
//       │  Message appears in their chat
//       ▼
//   The bridge sends back a delivery receipt (m.receipt) which the listener
//   picks up and uses to confirm delivery.
//
// ---------------------------------------------------------------------------

/**
 * Internal mutation to update the message's eventId after the Matrix API
 * returns the real event ID (replacing the placeholder "outbound_*" id).
 *
 * WHY THIS MATTERS:
 * - The insertMessage mutation (used by the listener for incoming messages)
 *   deduplicates by eventId. When the listener picks up our own outbound
 *   message from Matrix /sync, it will arrive with the REAL event ID
 *   (e.g. "$abc123:matrix.local"). If we've already patched our message
 *   to use that same ID, the dedup check finds it and skips the duplicate.
 * - Without this patch, the listener would see an unknown eventId and insert
 *   the same message a second time — once as "outbound_*" and once with the
 *   real ID.
 */
export const patchMessageEventId = internalMutation({
  args: {
    messageId: v.id("messages"),
    eventId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, { eventId: args.eventId });
  },
});

/**
 * Send a text message to a Matrix room via the homeserver API.
 * Scheduled by the `sendMessage` mutation so delivery happens asynchronously.
 *
 * On success, patches the Convex message record with the real Matrix eventId.
 */
export const sendMatrixMessage = internalAction({
  args: {
    // The Matrix room ID (e.g. "!abc123:matrix.local") — identifies which
    // room/conversation to send to. Each conversation maps 1:1 to a Matrix room.
    matrixRoomId: v.string(),

    // The Convex document ID of the message we just inserted. We need this
    // so we can patch the record with the real Matrix eventId after sending.
    messageId: v.id("messages"),

    // The plain-text message body to send.
    content: v.string(),
  },
  handler: async (ctx, args) => {
    // ── Step 1: Load Matrix connection details from the config table ──
    // The listener persists these on startup (see listener/src/index.ts ~line 697).
    // - matrix_homeserver_url: e.g. "http://dendrite:8008" (Docker-internal URL)
    // - matrix_bot_access_token: the bot's current access token for auth
    const homeserver = (await ctx.runQuery(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "config:get" as any,
      { key: "matrix_homeserver_url" },
    )) as string | null;

    const token = (await ctx.runQuery(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "config:get" as any,
      { key: "matrix_bot_access_token" },
    )) as string | null;

    if (!homeserver || !token) {
      console.error(
        "[sendMessage] Missing Matrix config — cannot send message. " +
          "Make sure the listener has started at least once to persist credentials.",
      );
      return;
    }

    // ── Step 2: Build the Matrix send URL ──
    // Matrix uses a PUT with a client-generated transaction ID (txnId) for
    // idempotency. If the same txnId is sent twice, the homeserver returns
    // the same event_id without creating a duplicate — this protects against
    // network retries.
    const txnId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const url = `${homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(args.matrixRoomId)}/send/m.room.message/${txnId}`;

    try {
      // ── Step 3: Call the Matrix Client-Server API ──
      // We send as the bot user (whose token we loaded above). The bot is a
      // member of every bridged room, so it has permission to send messages.
      // The bridge bot (e.g. @whatsappbot:matrix.local) is also in the room —
      // it will pick up this event via /sync and relay it to WhatsApp.
      const res = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // m.text is the standard Matrix message type for plain text.
          // For media, you'd use m.image, m.file, etc. (future enhancement).
          msgtype: "m.text",
          body: args.content,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        console.error(`[sendMessage] Matrix API error: ${res.status} ${body}`);
        // The message stays in Convex with its placeholder eventId.
        // A future retry mechanism could pick these up.
        return;
      }

      // ── Step 4: Parse the response and patch the eventId ──
      // The homeserver returns { event_id: "$abc123:matrix.local" }.
      // We update our Convex message to use this real ID so that:
      // a) The listener's dedup check recognises it when it arrives via /sync
      // b) Read receipts, reactions, and edits can target the correct event
      const data = (await res.json()) as { event_id?: string };
      console.log(
        `[sendMessage] ✓ Sent to ${args.matrixRoomId} → eventId=${data.event_id}`,
      );

      if (data.event_id) {
        await ctx.runMutation(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "matrixActions:patchMessageEventId" as any,
          {
            messageId: args.messageId as Id<"messages">,
            eventId: data.event_id,
          },
        );
      }
    } catch (err) {
      console.error(
        "[sendMessage] Failed to send:",
        err instanceof Error ? err.message : err,
      );
    }
  },
});
