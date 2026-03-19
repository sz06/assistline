import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** List all configured channels. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("channels").collect();
  },
});

/** Get the first channel matching a given type (e.g. "whatsapp"). */
export const getByType = query({
  args: { type: v.union(v.literal("whatsapp"), v.literal("telegram")) },
  handler: async (ctx, args) => {
    return ctx.db
      .query("channels")
      .withIndex("by_type", (q) => q.eq("type", args.type))
      .first();
  },
});

/** Get a single channel by ID. */
export const get = query({
  args: { id: v.id("channels") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.id);
  },
});

// ---------------------------------------------------------------------------
// Public Mutations (called from the dashboard)
// ---------------------------------------------------------------------------

/** Create a new channel and set it to "disconnected". */
export const create = mutation({
  args: {
    type: v.union(v.literal("whatsapp"), v.literal("telegram")),
    label: v.string(),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("channels", {
      type: args.type,
      label: args.label,
      status: "disconnected",
      updatedAt: Date.now(),
    });
  },
});

/** Request pairing — sets status to "pairing" and kicks off the pairing action. */
export const requestPairing = mutation({
  args: { id: v.id("channels") },
  handler: async (ctx, args) => {
    const channel = await ctx.db.get(args.id);
    if (!channel) throw new Error("Channel not found");

    // Skip if already pairing
    if (channel.status === "pairing") return;

    await ctx.db.patch(args.id, {
      status: "pairing",
      qrCode: undefined,
      error: undefined,
      updatedAt: Date.now(),
    });

    // Schedule the pairing action
    if (channel.type === "whatsapp") {
      await ctx.scheduler.runAfter(
        0,
        internal.channelActions.startWhatsAppPairing,
        { channelId: args.id },
      );
    }
  },
});

/** Disconnect a channel (back to disconnected). */
export const disconnect = mutation({
  args: { id: v.id("channels") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "disconnected",
      qrCode: undefined,
      phoneNumber: undefined,
      connectedAt: undefined,
      error: undefined,
      updatedAt: Date.now(),
    });
  },
});

/** Update an existing channel's label or type. */
export const update = mutation({
  args: {
    id: v.id("channels"),
    type: v.optional(v.union(v.literal("whatsapp"), v.literal("telegram"))),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Channel not found");

    const patch: Record<string, unknown> = {};
    if (args.type !== undefined) patch.type = args.type;
    if (args.label !== undefined) patch.label = args.label;
    patch.updatedAt = Date.now();

    await ctx.db.patch(args.id, patch);
  },
});

/** Delete a channel entirely. */
export const remove = mutation({
  args: { id: v.id("channels") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// ---------------------------------------------------------------------------
// Internal Mutations (called from the pairing action)
// ---------------------------------------------------------------------------

/** Set QR code data during pairing. */
export const internalSetQrCode = internalMutation({
  args: {
    id: v.id("channels"),
    qrCode: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      qrCode: args.qrCode,
      updatedAt: Date.now(),
    });
  },
});

/** Mark channel as connected. */
export const internalSetConnected = internalMutation({
  args: {
    id: v.id("channels"),
    phoneNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "connected",
      qrCode: undefined,
      phoneNumber: args.phoneNumber,
      connectedAt: Date.now(),
      error: undefined,
      updatedAt: Date.now(),
    });
  },
});

/** Set error state. */
export const internalSetError = internalMutation({
  args: {
    id: v.id("channels"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "error",
      qrCode: undefined,
      error: args.error,
      updatedAt: Date.now(),
    });
  },
});
