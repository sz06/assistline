import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ---------------------------------------------------------------------------
// Groups CRUD & Sync
// ---------------------------------------------------------------------------

/** List all groups, most recently updated first. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("groups").order("desc").take(100);
  },
});

/** Get a single group by its Convex ID. */
export const get = query({
  args: { id: v.id("groups") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.id);
  },
});

/** Get a single group by its Matrix room ID. */
export const getByRoomId = query({
  args: { matrixRoomId: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("groups")
      .withIndex("by_matrixRoomId", (q) =>
        q.eq("matrixRoomId", args.matrixRoomId),
      )
      .first();
  },
});

/**
 * Upsert a group record from the Matrix room state.
 * Called by the listener when it detects a room with > 2 joined members.
 *
 * Returns the group's Convex ID.
 */
export const syncGroup = mutation({
  args: {
    matrixRoomId: v.string(),
    name: v.string(),
    topic: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    memberCount: v.number(),
    members: v.optional(
      v.array(
        v.object({
          matrixId: v.string(),
          displayName: v.optional(v.string()),
          role: v.optional(
            v.union(
              v.literal("admin"),
              v.literal("moderator"),
              v.literal("member"),
            ),
          ),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("groups")
      .withIndex("by_matrixRoomId", (q) =>
        q.eq("matrixRoomId", args.matrixRoomId),
      )
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        topic: args.topic,
        avatarUrl: args.avatarUrl,
        memberCount: args.memberCount,
        members: args.members,
        updatedAt: now,
      });
      return existing._id;
    }

    return ctx.db.insert("groups", {
      matrixRoomId: args.matrixRoomId,
      name: args.name,
      topic: args.topic,
      avatarUrl: args.avatarUrl,
      memberCount: args.memberCount,
      members: args.members,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Delete a group. */
export const remove = mutation({
  args: { id: v.id("groups") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
