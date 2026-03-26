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
        const artifactSuggestions = await ctx.db
          .query("artifactSuggestions")
          .withIndex("by_conversationId", (q) =>
            q.eq("conversationId", conv._id),
          )
          .collect();

        return { ...conv, participantDetails, artifactSuggestions };
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
    const convWithMessages = await buildConversationWithMessages(
      ctx,
      args.id,
      args.messageLimit ?? defaultMsgLimit,
    );
    if (!convWithMessages) return null;

    // Fetch contactSuggestions for every unique inbound sender (works for groups too)
    const uniqueContactIds = [
      ...new Set(
        convWithMessages.messages
          .map((m) => m.senderContactId)
          .filter((id): id is Id<"contacts"> => id !== null),
      ),
    ];

    const contactSuggestionsEntries = await Promise.all(
      uniqueContactIds.map(async (contactId) => {
        const rawSuggestions = await ctx.db
          .query("contactSuggestions")
          .withIndex("by_contactId", (q) => q.eq("contactId", contactId))
          .collect();

        // For "roles" suggestions, resolve role IDs → names and re-serialize the value
        const suggestions = await Promise.all(
          rawSuggestions.map(async (s) => {
            if (s.field !== "roles") return s;
            let roleIds: string[] = [];
            try {
              roleIds = JSON.parse(s.value) as string[];
            } catch {
              return s;
            }
            const roleNames = await Promise.all(
              roleIds.map(async (roleId: string) => {
                const role = await ctx.db.get(roleId as Id<"roles">);
                return role?.name ?? roleId;
              }),
            );
            return { ...s, value: JSON.stringify(roleNames) };
          }),
        );

        return [contactId, suggestions] as const;
      }),
    );

    // Record<contactId, suggestions[]> — easy O(1) lookup in the UI
    const contactSuggestions = Object.fromEntries(contactSuggestionsEntries);

    const artifactSuggestions = await ctx.db
      .query("artifactSuggestions")
      .withIndex("by_conversationId", (q) => q.eq("conversationId", args.id))
      .collect();

    return { ...convWithMessages, artifactSuggestions, contactSuggestions };
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
