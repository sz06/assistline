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

/** Return the N most recent messages in a conversation. */
export const getConversationHistoryQuery = internalQuery({
  args: {
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { conversationId, limit }) => {
    const messages = await ctx.db
      .query("messages")
      .filter((q) => q.eq(q.field("conversationId"), conversationId))
      .order("desc")
      .take(limit ?? 20);

    return messages.reverse().map((m) => ({
      sender: m.sender,
      direction: m.direction,
      text: m.text ?? "",
      timestamp: m._creationTime,
      isRedacted: m.isRedacted,
    }));
  },
});
