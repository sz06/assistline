import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

/**
 * Read a config value from the `config` table. For use inside other
 * Convex queries/mutations — pass in the ctx directly.
 */
export async function getConfigValue(
  ctx: QueryCtx,
  key: string,
  fallback: string,
): Promise<string> {
  const row = await ctx.db
    .query("config")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  return row?.value ?? fallback;
}

/**
 * Read a numeric config value. Parses the stored string as a number,
 * returning the fallback if missing or unparseable.
 */
export async function getConfigNumber(
  ctx: QueryCtx,
  key: string,
  fallback: number,
): Promise<number> {
  const raw = await getConfigValue(ctx, key, String(fallback));
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * Upsert a key-value config entry. Used by the listener to persist
 * the Matrix bot access token and homeserver URL, and by the dashboard
 * to edit system-level configuration.
 */
export const set = mutation({
  args: {
    key: v.string(),
    value: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("config")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { value: args.value });
    } else {
      await ctx.db.insert("config", { key: args.key, value: args.value });
    }
  },
});

/** Retrieve a single config value by key. */
export const get = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("config")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    return row?.value ?? null;
  },
});

/** List all config entries. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("config").collect();
  },
});
