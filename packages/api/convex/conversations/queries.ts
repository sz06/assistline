import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalQuery, query } from "../_generated/server";
import { getConfigNumber } from "../config";
import {
  buildConversationWithMessages,
  resolveParticipantDetails,
} from "./helpers";

export const list = query({
  args: {
    limit: v.optional(v.number()),
    channelId: v.optional(v.id("channels")),
  },
  handler: async (ctx, args) => {
    // Read default conversation fetch size from config table
    const defaultLimit = await getConfigNumber(
      ctx,
      "historicalFetchSize.conversations",
      20,
    );
    const limit = args.limit ?? defaultLimit;

    // Fetch recently updated conversations, optionally filtered by channel
    const conversations = args.channelId
      ? await ctx.db
          .query("conversations")
          .withIndex("by_channelId", (q) =>
            q.eq("channelId", args.channelId as Id<"channels">),
          )
          .order("desc")
          .take(limit)
      : await ctx.db
          .query("conversations")
          .withIndex("by_updatedAt")
          .order("desc")
          .take(limit);

    // Resolve participant details for display
    const withDetails = await Promise.all(
      conversations.map(async (conv) => {
        const participantDetails = await resolveParticipantDetails(ctx, conv);

        return {
          ...conv,
          participantDetails,
        };
      }),
    );

    return withDetails;
  },
});

export const getWithMessages = query({
  args: {
    id: v.id("conversations"),
    messageLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const defaultMsgLimit = await getConfigNumber(
      ctx,
      "historicalFetchSize.messagesPerConversation",
      50,
    );
    return buildConversationWithMessages(
      ctx,
      args.id,
      args.messageLimit ?? defaultMsgLimit,
    );
  },
});

// ---------------------------------------------------------------------------
// Internal queries for Chatter agent
// ---------------------------------------------------------------------------

/**
 * Internal query to load conversation with messages.
 * Used by Chatter's internalAction via ctx.runQuery.
 */
export const getWithMessagesInternal = internalQuery({
  args: {
    id: v.id("conversations"),
    messageLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const defaultMsgLimit = await getConfigNumber(
      ctx,
      "historicalFetchSize.messagesPerConversation",
      50,
    );
    return buildConversationWithMessages(
      ctx,
      args.id,
      args.messageLimit ?? defaultMsgLimit,
    );
  },
});

/**
 * Simple internal query to get a conversation by ID.
 * Used by Chatter to check agentThreadId.
 */
export const getByIdInternal = internalQuery({
  args: { id: v.id("conversations") },
  handler: async (ctx, { id }) => {
    return ctx.db.get(id);
  },
});
