import { v } from "convex/values";
import { internalQuery, query } from "../_generated/server";

/**
 * List pending artifact suggestions for a given chat session or conversation.
 */
export const list = query({
  args: {
    sessionId: v.optional(v.id("chatSessions")),
    conversationId: v.optional(v.id("conversations")),
  },
  handler: async (ctx, args) => {
    if (args.sessionId) {
      return ctx.db
        .query("artifactSuggestions")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
        .collect();
    }
    if (args.conversationId) {
      return ctx.db
        .query("artifactSuggestions")
        .withIndex("by_conversationId", (q) =>
          q.eq("conversationId", args.conversationId),
        )
        .collect();
    }
    return [];
  },
});

/**
 * Internal query: fetch pending suggestions for a given scope.
 * Used by the Artifactor agent to inject pending suggestions into the LLM prompt.
 */
export const listPending = internalQuery({
  args: {
    sessionId: v.optional(v.id("chatSessions")),
    conversationId: v.optional(v.id("conversations")),
  },
  handler: async (ctx, args) => {
    if (args.conversationId) {
      return ctx.db
        .query("artifactSuggestions")
        .withIndex("by_conversationId", (q) =>
          q.eq("conversationId", args.conversationId),
        )
        .collect();
    }
    if (args.sessionId) {
      return ctx.db
        .query("artifactSuggestions")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
        .collect();
    }
    return [];
  },
});

export const getMissingEmbeddings = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("artifactSuggestions").collect();
    return all.filter((s) => !s.embedding);
  },
});

/**
 * List all pending artifact suggestions across all scopes.
 */
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("artifactSuggestions").order("desc").collect();
  },
});

export const fetchByIds = internalQuery({
  args: {
    ids: v.array(v.id("artifactSuggestions")),
  },
  handler: async (ctx, args) => {
    const results = [];
    for (const id of args.ids) {
      const doc = await ctx.db.get(id);
      if (doc) results.push(doc);
    }
    return results;
  },
});
