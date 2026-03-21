import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";

export const create = mutation({
  args: {
    value: v.string(),
    description: v.string(),
    accessibleToRoles: v.array(v.id("roles")),
    expiresAt: v.optional(v.number()),
    source: v.optional(
      v.union(v.literal("user"), v.literal("agent"), v.literal("system")),
    ),
  },
  handler: async (ctx, args) => {
    const { source, ...fields } = args;
    const id = await ctx.db.insert("artifacts", {
      value: fields.value,
      description: fields.description,
      accessibleToRoles: fields.accessibleToRoles,
      expiresAt: fields.expiresAt,
      updatedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "artifact.create",
      source: source ?? "user",
      entity: "artifacts",
      entityId: id,
      details: JSON.stringify({ description: args.description }),
      timestamp: Date.now(),
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("artifacts"),
    value: v.optional(v.string()),
    description: v.optional(v.string()),
    accessibleToRoles: v.optional(v.array(v.id("roles"))),
    expiresAt: v.optional(v.number()),
    source: v.optional(
      v.union(v.literal("user"), v.literal("agent"), v.literal("system")),
    ),
  },
  handler: async (ctx, args) => {
    const { id, source, ...patch } = args;
    await ctx.db.patch(id, {
      ...patch,
      updatedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "artifact.update",
      source: source ?? "user",
      entity: "artifacts",
      entityId: id,
      details: JSON.stringify({
        description: patch.description,
      }),
      timestamp: Date.now(),
    });
    return id;
  },
});

export const get = query({
  args: { id: v.id("artifacts") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("artifacts").order("desc").collect();
  },
});

export const remove = mutation({
  args: {
    id: v.id("artifacts"),
    source: v.optional(
      v.union(v.literal("user"), v.literal("agent"), v.literal("system")),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    await ctx.db.delete(args.id);
    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "artifact.delete",
      source: args.source ?? "user",
      entity: "artifacts",
      entityId: args.id,
      details: JSON.stringify({ description: existing?.description }),
      timestamp: Date.now(),
    });
  },
});

export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expiredArtifacts = await ctx.db
      .query("artifacts")
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .collect();

    let count = 0;
    for (const artifact of expiredArtifacts) {
      await ctx.db.delete(artifact._id);
      await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
        action: "artifact.expired",
        source: "system",
        entity: "artifacts",
        entityId: artifact._id,
        details: JSON.stringify({ description: artifact.description }),
        timestamp: now,
      });
      count++;
    }
    console.log(`Cleaned up ${count} expired artifacts.`);
  },
});

// ---------------------------------------------------------------------------
// Internal queries for Chatter agent tools
// ---------------------------------------------------------------------------

/**
 * Search artifacts filtered by participant roles in a conversation.
 * Only artifacts accessible to conversation participant roles are returned.
 */
export const getArtifactsQuery = internalQuery({
  args: {
    conversationId: v.id("conversations"),
    query: v.string(),
  },
  handler: async (ctx, { conversationId, query }) => {
    const conversation = await ctx.db.get(conversationId);
    if (!conversation) return [];

    // Gather roles of conversation participants via contactIdentities
    const participantRoleIds: string[] = [];
    if (conversation.participants) {
      for (const pid of conversation.participants) {
        const identity = await ctx.db
          .query("contactIdentities")
          .withIndex("by_matrixId", (q) => q.eq("matrixId", pid))
          .first();
        if (identity) {
          const contact = await ctx.db.get(identity.contactId);
          if (contact?.roles) {
            for (const r of contact.roles) {
              const rStr = r.toString();
              if (!participantRoleIds.includes(rStr))
                participantRoleIds.push(rStr);
            }
          }
        }
      }
    }

    const allArtifacts = await ctx.db.query("artifacts").collect();
    const queryLower = query.toLowerCase();

    return allArtifacts
      .filter((a) => {
        const matchesQuery =
          a.value.toLowerCase().includes(queryLower) ||
          a.description.toLowerCase().includes(queryLower);
        if (!matchesQuery) return false;

        if (a.accessibleToRoles && a.accessibleToRoles.length > 0) {
          return a.accessibleToRoles.some((r) =>
            participantRoleIds.includes(r.toString()),
          );
        }
        return true;
      })
      .slice(0, 10);
  },
});

// ---------------------------------------------------------------------------
// Internal mutations/queries for Artifactor agent
// ---------------------------------------------------------------------------

/**
 * Fetch full artifact documents by their IDs.
 * Used after ctx.vectorSearch() in action context to hydrate results.
 */
export const fetchByIds = internalQuery({
  args: {
    ids: v.array(v.id("artifacts")),
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

/**
 * Create an artifact with an embedding vector.
 * Used by the Artifactor agent to persist new facts.
 */
export const internalCreate = internalMutation({
  args: {
    value: v.string(),
    description: v.string(),
    accessibleToRoles: v.array(v.id("roles")),
    embedding: v.optional(v.array(v.float64())),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("artifacts", {
      value: args.value,
      description: args.description,
      accessibleToRoles: args.accessibleToRoles,
      embedding: args.embedding,
      expiresAt: args.expiresAt,
      updatedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "artifact.create",
      source: "agent",
      entity: "artifacts",
      entityId: id,
      details: JSON.stringify({
        description: args.description,
        via: "artifactor",
      }),
      timestamp: Date.now(),
    });
    return id;
  },
});

/**
 * Update an artifact's value, description, and/or embedding.
 * Used by the Artifactor agent to update existing facts.
 */
export const internalUpdate = internalMutation({
  args: {
    id: v.id("artifacts"),
    value: v.optional(v.string()),
    description: v.optional(v.string()),
    embedding: v.optional(v.array(v.float64())),
  },
  handler: async (ctx, args) => {
    const { id, ...patch } = args;
    await ctx.db.patch(id, {
      ...patch,
      updatedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "artifact.update",
      source: "agent",
      entity: "artifacts",
      entityId: id,
      details: JSON.stringify({
        description: patch.description,
        via: "artifactor",
      }),
      timestamp: Date.now(),
    });
    return id;
  },
});
