import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";

export const create = mutation({
  args: {
    value: v.string(),
    description: v.string(),
    accessibleToRoles: v.array(v.id("roles")),
    expiresAt: v.optional(v.number()),
    source: v.optional(v.union(v.literal("auto"), v.literal("manual"))),
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
      source: source ?? "manual",
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
    source: v.optional(v.union(v.literal("auto"), v.literal("manual"))),
  },
  handler: async (ctx, args) => {
    const { id, source, ...patch } = args;
    await ctx.db.patch(id, {
      ...patch,
      updatedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "artifact.update",
      source: source ?? "manual",
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
    source: v.optional(v.union(v.literal("auto"), v.literal("manual"))),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    await ctx.db.delete(args.id);
    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "artifact.delete",
      source: args.source ?? "manual",
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
        source: "auto",
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
