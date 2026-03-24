import { v } from "convex/values";
import { internalQuery, query } from "../_generated/server";

export const listMessages = query({
  args: {
    conversationId: v.optional(v.id("conversations")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { conversationId, limit } = args;

    if (conversationId) {
      return ctx.db
        .query("messages")
        .withIndex("by_conversationId_timestamp", (q) =>
          q.eq("conversationId", conversationId),
        )
        .take(limit ?? 50);
    }

    return ctx.db
      .query("messages")
      .order("desc") // globally latest
      .take(limit ?? 50);
  },
});

// ---------------------------------------------------------------------------
// Internal queries for Chatter agent tools
// ---------------------------------------------------------------------------

/** Return the N most recent messages in a conversation, optionally after a given timestamp. */
export const getConversationHistoryQuery = internalQuery({
  args: {
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
    sinceTimestamp: v.optional(v.number()),
  },
  handler: async (ctx, { conversationId, limit, sinceTimestamp }) => {
    const query = ctx.db
      .query("messages")
      .withIndex("by_conversationId_timestamp", (q) => {
        const base = q.eq("conversationId", conversationId);
        return sinceTimestamp ? base.gt("timestamp", sinceTimestamp) : base;
      })
      .order("desc");

    const maxResults = limit ?? 20;
    const messages = await query.take(maxResults);

    return messages.reverse().map((m) => ({
      _id: m._id,
      sender: m.sender,
      direction: m.direction,
      text: m.text ?? "",
      timestamp: m.timestamp,
      isRedacted: m.isRedacted,
    }));
  },
});
