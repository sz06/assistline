import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, mutation } from "../_generated/server";

/**
 * Push a new artifact suggestion to the queue. Used by the Artifactor agent.
 * Skips insertion if an identical (scope + type + value) suggestion already exists.
 */
export const push = internalMutation({
  args: {
    sessionId: v.optional(v.id("chatSessions")),
    conversationId: v.optional(v.id("conversations")),
    type: v.union(v.literal("create"), v.literal("update")),
    value: v.string(),
    artifactId: v.optional(v.id("artifacts")),
    embedding: v.optional(v.array(v.float64())),
    accessibleToRoles: v.optional(v.array(v.id("roles"))),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Dedup: skip if same scope + type + value already has a pending suggestion
    if (args.conversationId) {
      const existing = await ctx.db
        .query("artifactSuggestions")
        .withIndex("by_conversationId", (q) =>
          q.eq("conversationId", args.conversationId),
        )
        .filter((q) =>
          q.and(
            q.eq(q.field("type"), args.type),
            q.eq(q.field("value"), args.value),
          ),
        )
        .first();

      if (existing) {
        console.log(
          `[ArtifactSuggestions] Skipping duplicate suggestion: "${args.value}"`,
        );
        return;
      }
    } else if (args.sessionId) {
      const existing = await ctx.db
        .query("artifactSuggestions")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
        .filter((q) =>
          q.and(
            q.eq(q.field("type"), args.type),
            q.eq(q.field("value"), args.value),
          ),
        )
        .first();

      if (existing) {
        console.log(
          `[ArtifactSuggestions] Skipping duplicate suggestion: "${args.value}"`,
        );
        return;
      }
    }

    await ctx.db.insert("artifactSuggestions", {
      sessionId: args.sessionId,
      conversationId: args.conversationId,
      type: args.type,
      value: args.value,
      artifactId: args.artifactId,
      embedding: args.embedding,
      accessibleToRoles: args.accessibleToRoles,
      expiresAt: args.expiresAt,
    });
  },
});

/**
 * Dismiss a suggested artifact by deleting it from the suggestions queue.
 */
export const dismiss = mutation({
  args: {
    suggestionId: v.id("artifactSuggestions"),
  },
  handler: async (ctx, args) => {
    const suggestion = await ctx.db.get(args.suggestionId);
    if (!suggestion) return;

    await ctx.db.delete(args.suggestionId);

    // Optionally log to audit trail
    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "artifact.suggestion.dismissed",
      source: "user",
      entity: "artifactSuggestions",
      entityId: args.suggestionId,
      details: JSON.stringify({
        type: suggestion.type,
        value: suggestion.value,
      }),
      timestamp: Date.now(),
    });
  },
});

/**
 * Execute (approve) a suggested artifact, invoking the underlying artifacts mutation and deleting the suggestion.
 */
export const execute = mutation({
  args: {
    suggestionId: v.id("artifactSuggestions"),
  },
  handler: async (ctx, args) => {
    const suggestion = await ctx.db.get(args.suggestionId);
    if (!suggestion) return;

    // Delete the suggestion as it has been acted upon
    await ctx.db.delete(args.suggestionId);

    // Execute the requested artifact action
    if (suggestion.type === "create") {
      await ctx.runMutation(internal.artifacts.internalCreate, {
        value: suggestion.value,
        accessibleToRoles: suggestion.accessibleToRoles ?? [],
        embedding: suggestion.embedding,
        expiresAt: suggestion.expiresAt,
      });
    } else if (suggestion.type === "update" && suggestion.artifactId) {
      await ctx.runMutation(internal.artifacts.internalUpdate, {
        id: suggestion.artifactId,
        value: suggestion.value,
        embedding: suggestion.embedding,
        accessibleToRoles: suggestion.accessibleToRoles,
        expiresAt: suggestion.expiresAt,
      });
    }
  },
});

/**
 * Internal update for artifact suggestions.
 */
export const internalUpdate = internalMutation({
  args: {
    id: v.id("artifactSuggestions"),
    value: v.optional(v.string()),
    embedding: v.optional(v.array(v.float64())),
    accessibleToRoles: v.optional(v.array(v.id("roles"))),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...patch } = args;
    await ctx.db.patch(id, patch);
  },
});
