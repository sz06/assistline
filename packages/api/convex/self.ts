import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";

// ---------------------------------------------------------------------------
// Self-Contact Module
//
// Centralized helpers for identifying the user's own contact record.
// The "self" contact is the single contacts row with `isSelf === true`.
// Its Matrix IDs live in `contactIdentities` like every other contact.
// ---------------------------------------------------------------------------

// ── Queries ───────────────────────────────────────────────────────────────────

/** Public query — returns the self-contact record (or null if not yet set). */
export const get = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("contacts")
      .withIndex("by_isSelf", (q) => q.eq("isSelf", true))
      .first();
  },
});

/** Internal query — returns the self-contact record. */
export const getInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("contacts")
      .withIndex("by_isSelf", (q) => q.eq("isSelf", true))
      .first();
  },
});

/**
 * Internal query — returns true if the given Matrix ID belongs to the
 * self-contact (via contactIdentities).
 */
export const isSelfSender = internalQuery({
  args: { sender: v.string() },
  handler: async (ctx, { sender }) => {
    const selfContact = await ctx.db
      .query("contacts")
      .withIndex("by_isSelf", (q) => q.eq("isSelf", true))
      .first();
    if (!selfContact) return false;

    const identity = await ctx.db
      .query("contactIdentities")
      .withIndex("by_matrixId", (q) => q.eq("matrixId", sender))
      .first();
    return identity?.contactId === selfContact._id;
  },
});

/**
 * Internal query — returns the Set-compatible array of all Matrix IDs
 * belonging to the self-contact. Used by ingest and ephemeral handlers.
 */
export const getSelfMatrixIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const selfContact = await ctx.db
      .query("contacts")
      .withIndex("by_isSelf", (q) => q.eq("isSelf", true))
      .first();
    if (!selfContact) return [];

    const identities = await ctx.db
      .query("contactIdentities")
      .withIndex("by_contactId", (q) => q.eq("contactId", selfContact._id))
      .collect();
    return identities.map((i) => i.matrixId);
  },
});

// ── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Add a Matrix ID as a contactIdentity for the self-contact.
 * Called by the listener when a channel connects and the self-puppet ID is known.
 * If no self-contact exists yet, this is a no-op (the user must toggle isSelf first).
 */
export const addSelfIdentity = internalMutation({
  args: {
    matrixId: v.string(),
    platform: v.optional(v.string()),
  },
  handler: async (ctx, { matrixId, platform }) => {
    const selfContact = await ctx.db
      .query("contacts")
      .withIndex("by_isSelf", (q) => q.eq("isSelf", true))
      .first();

    if (!selfContact) {
      console.warn(
        `[self] No self-contact found. Cannot register Matrix ID: ${matrixId}. Toggle isSelf on your contact first.`,
      );
      return;
    }

    // Check if this identity already exists
    const existing = await ctx.db
      .query("contactIdentities")
      .withIndex("by_matrixId", (q) => q.eq("matrixId", matrixId))
      .first();

    if (existing) {
      // Already registered (possibly for a different contact) — skip
      if (existing.contactId === selfContact._id) return;
      console.warn(
        `[self] Matrix ID ${matrixId} is already linked to contact ${String(existing.contactId)}, not self-contact ${String(selfContact._id)}.`,
      );
      return;
    }

    await ctx.db.insert("contactIdentities", {
      contactId: selfContact._id,
      matrixId,
      platform,
    });
    console.log(`[self] Added self-identity: ${matrixId}`);
  },
});
