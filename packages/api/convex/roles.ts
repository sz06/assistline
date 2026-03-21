import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalQuery, mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("roles").order("asc").collect();
  },
});

export const listInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("roles").order("asc").collect();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Avoid exact duplicate names
    const existing = await ctx.db
      .query("roles")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();

    if (existing) {
      throw new Error("A role with this name already exists.");
    }

    const id = await ctx.db.insert("roles", args);
    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "role.create",
      source: "manual",
      entity: "roles",
      entityId: id,
      details: JSON.stringify({ name: args.name }),
      timestamp: Date.now(),
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("roles"),
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("roles")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();

    if (existing && existing._id !== args.id) {
      throw new Error("A role with this name already exists.");
    }

    await ctx.db.patch(args.id, {
      name: args.name,
      description: args.description,
    });
    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "role.update",
      source: "manual",
      entity: "roles",
      entityId: args.id,
      details: JSON.stringify({ name: args.name }),
      timestamp: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("roles") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    await ctx.db.delete(args.id);
    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "role.delete",
      source: "manual",
      entity: "roles",
      entityId: args.id,
      details: JSON.stringify({ name: existing?.name }),
      timestamp: Date.now(),
    });
  },
});
