import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";

// ── Queries ───────────────────────────────────────────────────────────────────

/** Public query — returns the singleton user profile (or null if not yet set). */
export const get = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("userProfile").first();
  },
});

/** Internal query — same as get, for use by agents and ingest. */
export const getInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("userProfile").first();
  },
});

/**
 * Internal query — returns true if the given Matrix ID belongs to the user.
 * Used for self-detection in ingest and conversation helpers.
 */
export const isSelf = internalQuery({
  args: {
    matrixId: v.string(),
  },
  handler: async (ctx, { matrixId }) => {
    const profile = await ctx.db.query("userProfile").first();
    return profile?.matrixIds?.includes(matrixId) ?? false;
  },
});

// ── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Public mutation — create or update the singleton user profile.
 * Call from the dashboard Profile settings page.
 */
export const upsert = mutation({
  args: {
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    matrixIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("userProfile").first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...(args.name !== undefined && { name: args.name }),
        ...(args.avatarUrl !== undefined && { avatarUrl: args.avatarUrl }),
        ...(args.matrixIds !== undefined && { matrixIds: args.matrixIds }),
      });
    } else {
      await ctx.db.insert("userProfile", {
        name: args.name,
        avatarUrl: args.avatarUrl,
        matrixIds: args.matrixIds ?? [],
      });
    }
  },
});

/**
 * Internal mutation — append a Matrix ID to the user's matrixIds list if not
 * already present. Called by the listener when a channel connects and the
 * self-puppet ID is known.
 */
export const addMatrixId = internalMutation({
  args: {
    matrixId: v.string(),
  },
  handler: async (ctx, { matrixId }) => {
    const existing = await ctx.db.query("userProfile").first();
    if (existing) {
      const ids = existing.matrixIds ?? [];
      if (!ids.includes(matrixId)) {
        await ctx.db.patch(existing._id, { matrixIds: [...ids, matrixId] });
        console.log(`[userProfile] Added Matrix ID: ${matrixId}`);
      }
    } else {
      await ctx.db.insert("userProfile", { matrixIds: [matrixId] });
      console.log(`[userProfile] Created profile with Matrix ID: ${matrixId}`);
    }
  },
});

/**
 * Internal mutation — remove a Matrix ID (e.g. when a channel disconnects).
 */
export const removeMatrixId = internalMutation({
  args: {
    matrixId: v.string(),
  },
  handler: async (ctx, { matrixId }) => {
    const existing = await ctx.db.query("userProfile").first();
    if (existing?.matrixIds) {
      await ctx.db.patch(existing._id, {
        matrixIds: existing.matrixIds.filter((id) => id !== matrixId),
      });
      console.log(`[userProfile] Removed Matrix ID: ${matrixId}`);
    }
  },
});
