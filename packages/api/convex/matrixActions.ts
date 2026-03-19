import { v } from "convex/values";
import { action } from "./_generated/server";

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
