import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server";
import { channelDataValidator } from "../schema";

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
  args: {
    type: v.union(
      v.literal("whatsapp"),
      v.literal("telegram"),
      v.literal("facebook"),
      v.literal("instagram"),
    ),
  },
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
    type: v.union(
      v.literal("whatsapp"),
      v.literal("telegram"),
      v.literal("facebook"),
      v.literal("instagram"),
    ),
    label: v.string(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("channels", {
      type: args.type,
      label: args.label,
      status: "disconnected",
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "channel.create",
      source: "user",
      entity: "channels",
      entityId: id,
      details: JSON.stringify({ type: args.type, label: args.label }),
      timestamp: Date.now(),
    });
    return id;
  },
});

/** Request pairing — sets status to "pairing" and kicks off the pairing action. */
export const requestPairing = mutation({
  args: {
    id: v.id("channels"),
    phoneNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const channel = await ctx.db.get(args.id);
    if (!channel) throw new Error("Channel not found");

    // Skip if already pairing
    if (channel.status === "pairing") return;

    await ctx.db.patch(args.id, {
      status: "pairing",
      channelData: undefined,
      error: undefined,
      updatedAt: Date.now(),
    });

    // Schedule the pairing action
    if (channel.type === "whatsapp") {
      if (!args.phoneNumber) {
        throw new Error("Phone number is required to pair WhatsApp");
      }
      await ctx.scheduler.runAfter(
        0,
        internal.channels.whatsapp.startWhatsAppPairing,
        { channelId: args.id, phoneNumber: args.phoneNumber },
      );
    } else if (channel.type === "facebook" || channel.type === "instagram") {
      await ctx.scheduler.runAfter(0, internal.channels.meta.startMetaPairing, {
        channelId: args.id,
      });
    }

    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "channel.requestPairing",
      source: "user",
      entity: "channels",
      entityId: args.id,
      details: JSON.stringify({ type: channel.type }),
      timestamp: Date.now(),
    });
  },
});

/** Disconnect a channel (back to disconnected). */
export const disconnect = mutation({
  args: { id: v.id("channels") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "disconnected",
      channelData: undefined,
      connectedAt: undefined,
      error: undefined,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "channel.disconnect",
      source: "user",
      entity: "channels",
      entityId: args.id,
      timestamp: Date.now(),
    });
  },
});

/** Update an existing channel's label or type. */
export const update = mutation({
  args: {
    id: v.id("channels"),
    type: v.optional(
      v.union(
        v.literal("whatsapp"),
        v.literal("telegram"),
        v.literal("facebook"),
        v.literal("instagram"),
      ),
    ),
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
    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "channel.update",
      source: "user",
      entity: "channels",
      entityId: args.id,
      details: JSON.stringify({ label: args.label, type: args.type }),
      timestamp: Date.now(),
    });
  },
});

/** Delete a channel entirely. */
export const remove = mutation({
  args: { id: v.id("channels") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    await ctx.db.delete(args.id);
    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "channel.delete",
      source: "user",
      entity: "channels",
      entityId: args.id,
      details: JSON.stringify({ label: existing?.label, type: existing?.type }),
      timestamp: Date.now(),
    });
  },
});

// ---------------------------------------------------------------------------
// Internal Queries & Mutations (called from the pairing action)
// ---------------------------------------------------------------------------

/** Get a channel by ID (internal). */
export const internalGet = internalQuery({
  args: { id: v.id("channels") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.id);
  },
});

/** Mark channel as connected (clears pairing state, stores bridge-specific data). */
export const internalSetConnected = internalMutation({
  args: {
    id: v.id("channels"),
    selfPuppetId: v.optional(v.string()),
    channelData: v.optional(channelDataValidator),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "connected",
      channelData: args.channelData,
      selfPuppetId: args.selfPuppetId,
      connectedAt: Date.now(),
      error: undefined,
      updatedAt: Date.now(),
    });
  },
});

/** Store the Matrix puppet ID for the authenticated user on this channel. */
export const internalSetSelfPuppetId = internalMutation({
  args: {
    id: v.id("channels"),
    selfPuppetId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      selfPuppetId: args.selfPuppetId,
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
      channelData: undefined,
      error: args.error,
      updatedAt: Date.now(),
    });
  },
});

/** Mark a channel as disconnected due to a bridge state change (e.g. BAD_CREDENTIALS). */
export const setBridgeDisconnected = internalMutation({
  args: {
    id: v.id("channels"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "error",
      channelData: undefined,
      error: args.error,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "channel.bridgeDisconnect",
      source: "system",
      entity: "channels",
      entityId: args.id,
      details: JSON.stringify({ error: args.error }),
      timestamp: Date.now(),
    });
  },
});
