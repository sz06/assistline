import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, internalMutation } from "./_generated/server";

/**
 * Send a read receipt to the Matrix homeserver so the bridge forwards it
 * to WhatsApp. This makes messages appear as "read" (blue checkmarks) on
 * the sender's phone when the user views them in the dashboard.
 *
 * The action reads the bot access token from the `settings` table (persisted
 * by the listener on startup) and calls the Matrix receipt API.
 */
export const sendReadReceipt = action({
  args: {
    matrixRoomId: v.string(),
    eventId: v.string(),
  },
  handler: async (ctx, args) => {
    // Read connection details from settings (stored by listener on startup)
    const homeserver = (await ctx.runQuery(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "settings:get" as any,
      { key: "matrix_homeserver_url" },
    )) as string | null;

    const token = (await ctx.runQuery(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "settings:get" as any,
      { key: "matrix_bot_access_token" },
    )) as string | null;

    if (!homeserver || !token) {
      console.warn(
        "[readReceipt] Missing Matrix settings — skipping read receipt",
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

/**
 * Internal mutation to update the message's eventId after the Matrix API
 * returns the real event ID (replacing the placeholder "outbound_*" id).
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
    matrixRoomId: v.string(),
    messageId: v.id("messages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    // Read Matrix connection details from settings (stored by the listener)
    const homeserver = (await ctx.runQuery(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "settings:get" as any,
      { key: "matrix_homeserver_url" },
    )) as string | null;

    const token = (await ctx.runQuery(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "settings:get" as any,
      { key: "matrix_bot_access_token" },
    )) as string | null;

    if (!homeserver || !token) {
      console.error(
        "[sendMessage] Missing Matrix settings — cannot send message",
      );
      return;
    }

    const txnId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const url = `${homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(args.matrixRoomId)}/send/m.room.message/${txnId}`;

    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          msgtype: "m.text",
          body: args.content,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        console.error(
          `[sendMessage] Matrix API error: ${res.status} ${body}`,
        );
        return;
      }

      const data = (await res.json()) as { event_id?: string };
      console.log(
        `[sendMessage] ✓ Sent to ${args.matrixRoomId} → eventId=${data.event_id}`,
      );

      // Update the outbound message with the real Matrix event ID
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
