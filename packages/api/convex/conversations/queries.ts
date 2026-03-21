import { paginationOptsValidator } from "convex/server";
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
    channelId: v.optional(v.id("channels")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    // Build query, optionally filtered by channel
    const baseQuery = args.channelId
      ? ctx.db
          .query("conversations")
          .withIndex("by_channelId", (q) =>
            q.eq("channelId", args.channelId as Id<"channels">),
          )
          .order("desc")
      : ctx.db.query("conversations").withIndex("by_updatedAt").order("desc");

    const paginatedResult = await baseQuery.paginate(args.paginationOpts);

    // Resolve participant details for each conversation in this page
    const pageWithDetails = await Promise.all(
      paginatedResult.page.map(async (conv) => {
        const participantDetails = await resolveParticipantDetails(ctx, conv);
        return { ...conv, participantDetails };
      }),
    );

    return { ...paginatedResult, page: pageWithDetails };
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
