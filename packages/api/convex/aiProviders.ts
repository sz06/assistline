import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalQuery, mutation, query } from "./_generated/server";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** List all configured AI providers. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("aiProviders").collect();
  },
});

/** Internal: list all providers (for use by internal actions like Chatter). */
export const listInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("aiProviders").collect();
  },
});

/** Get a single provider by ID. */
export const get = query({
  args: { id: v.id("aiProviders") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.id);
  },
});

/** Get the current default provider, optionally filtered by type. */
export const getDefault = query({
  args: {
    type: v.optional(v.union(v.literal("language"), v.literal("embedding"))),
  },
  handler: async (ctx, args) => {
    if (args.type) {
      // Find a default provider of the requested type
      const all = await ctx.db
        .query("aiProviders")
        .withIndex("by_type", (q) => q.eq("type", args.type!))
        .collect();
      return all.find((p) => p.isDefault) ?? all[0] ?? null;
    }
    return ctx.db
      .query("aiProviders")
      .withIndex("by_isDefault", (q) => q.eq("isDefault", true))
      .first();
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Create (add) a new AI provider. */
export const create = mutation({
  args: {
    provider: v.string(),
    type: v.union(v.literal("language"), v.literal("embedding")),
    name: v.optional(v.string()),
    model: v.optional(v.string()),
    apiKey: v.optional(v.string()),
    isDefault: v.boolean(),
  },
  handler: async (ctx, args) => {
    // If marking as default, un-default any existing default of the same type
    if (args.isDefault) {
      const sameType = await ctx.db
        .query("aiProviders")
        .withIndex("by_type", (q) => q.eq("type", args.type))
        .collect();
      for (const p of sameType) {
        if (p.isDefault) {
          await ctx.db.patch(p._id, { isDefault: false });
        }
      }
    }
    const id = await ctx.db.insert("aiProviders", {
      provider: args.provider,
      type: args.type,
      name: args.name,
      model: args.model,
      apiKey: args.apiKey,
      isDefault: args.isDefault,
    });
    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "aiProvider.create",
      source: "manual",
      entity: "aiProviders",
      entityId: id,
      details: JSON.stringify({
        provider: args.provider,
        name: args.name,
        model: args.model,
      }),
      timestamp: Date.now(),
    });
    return id;
  },
});

/** Update an existing provider's configuration. */
export const update = mutation({
  args: {
    id: v.id("aiProviders"),
    provider: v.optional(v.string()),
    type: v.optional(v.union(v.literal("language"), v.literal("embedding"))),
    name: v.optional(v.string()),
    model: v.optional(v.string()),
    apiKey: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Provider not found");

    // If setting as default, un-default only same type
    if (args.isDefault === true) {
      const resolvedType = args.type ?? existing.type;
      const sameType = await ctx.db
        .query("aiProviders")
        .withIndex("by_type", (q) => q.eq("type", resolvedType))
        .collect();
      for (const p of sameType) {
        if (p.isDefault && p._id !== args.id) {
          await ctx.db.patch(p._id, { isDefault: false });
        }
      }
    }

    const patch: Record<string, unknown> = {};
    if (args.provider !== undefined) patch.provider = args.provider;
    if (args.type !== undefined) patch.type = args.type;
    if (args.name !== undefined) patch.name = args.name;
    if (args.model !== undefined) patch.model = args.model;
    if (args.apiKey !== undefined) patch.apiKey = args.apiKey;
    if (args.isDefault !== undefined) patch.isDefault = args.isDefault;

    await ctx.db.patch(args.id, patch);
    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "aiProvider.update",
      source: "manual",
      entity: "aiProviders",
      entityId: args.id,
      details: JSON.stringify({
        provider: args.provider,
        name: args.name,
        model: args.model,
      }),
      timestamp: Date.now(),
    });
  },
});

/** Delete a provider. */
export const remove = mutation({
  args: { id: v.id("aiProviders") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    await ctx.db.delete(args.id);
    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "aiProvider.delete",
      source: "manual",
      entity: "aiProviders",
      entityId: args.id,
      details: JSON.stringify({
        provider: existing?.provider,
        name: existing?.name,
      }),
      timestamp: Date.now(),
    });
  },
});

/** Set a provider as the default (un-defaults others). */
export const setDefault = mutation({
  args: { id: v.id("aiProviders") },
  handler: async (ctx, args) => {
    const provider = await ctx.db.get(args.id);
    if (!provider) throw new Error("Provider not found");

    // Un-default all others of the same type
    const sameType = await ctx.db
      .query("aiProviders")
      .withIndex("by_type", (q) => q.eq("type", provider.type))
      .collect();
    for (const p of sameType) {
      if (p.isDefault && p._id !== args.id) {
        await ctx.db.patch(p._id, { isDefault: false });
      }
    }

    await ctx.db.patch(args.id, { isDefault: true });
    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "aiProvider.setDefault",
      source: "manual",
      entity: "aiProviders",
      entityId: args.id,
      details: JSON.stringify({
        provider: provider.provider,
        name: provider.name,
      }),
      timestamp: Date.now(),
    });
  },
});
