import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

// ---------------------------------------------------------------------------
// Internal Mutation — called via ctx.scheduler.runAfter(0, …) from other mutations
// ---------------------------------------------------------------------------

/** Insert a single audit log entry. Not exposed to the client. */
export const log = internalMutation({
  args: {
    action: v.string(),
    source: v.union(v.literal("auto"), v.literal("manual")),
    entity: v.optional(v.string()),
    entityId: v.optional(v.string()),
    details: v.optional(v.string()),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("auditLogs", {
      action: args.action,
      source: args.source,
      entity: args.entity,
      entityId: args.entityId,
      details: args.details,
      timestamp: args.timestamp,
    });
  },
});

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** List audit logs, newest first. Paginated. Supports optional source & entity filters. */
export const list = query({
  args: {
    source: v.optional(v.union(v.literal("auto"), v.literal("manual"))),
    entity: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    // Pick the right index based on the entity filter
    const baseQuery = args.entity
      ? ctx.db
          .query("auditLogs")
          .withIndex("by_entity", (q) => q.eq("entity", args.entity as string))
          .order("desc")
      : ctx.db.query("auditLogs").withIndex("by_timestamp").order("desc");

    // If we also need to filter by source, use .filter()
    const filteredQuery = args.source
      ? baseQuery.filter((q) => q.eq(q.field("source"), args.source as string))
      : baseQuery;

    return await filteredQuery.paginate(args.paginationOpts);
  },
});

/** Delete audit logs older than 7 days. Called by nightly cron. */
export const cleanupOld = internalMutation({
  args: {},
  handler: async (ctx) => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const old = await ctx.db
      .query("auditLogs")
      .withIndex("by_timestamp", (q) => q.lt("timestamp", sevenDaysAgo))
      .collect();

    let count = 0;
    for (const entry of old) {
      await ctx.db.delete(entry._id);
      count++;
    }
    console.log(`Cleaned up ${count} audit log entries older than 7 days.`);
  },
});
