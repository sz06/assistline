import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, mutation } from "../_generated/server";
import {
  findMessageByEventId,
  insertInboundMessage,
  insertOutboundMessage,
} from "./helpers";

// ---------------------------------------------------------------------------
// Inbound message insertion
//
// Public mutation — used by SimulatorPage in the dashboard.
// Both this and internalInsertMessage delegate to the shared
// insertInboundMessage helper in helpers.ts.
// ---------------------------------------------------------------------------

export const insertMessage = mutation({
  args: {
    matrixRoomId: v.string(),
    eventId: v.string(),
    sender: v.string(),
    text: v.string(),
    direction: v.union(v.literal("in"), v.literal("out")),
    timestamp: v.number(),
    type: v.optional(v.string()),
    replyToEventId: v.optional(v.string()),
    attachmentUrl: v.optional(v.string()),
    attachmentMimeType: v.optional(v.string()),
    attachmentFileName: v.optional(v.string()),
    attachmentSize: v.optional(v.number()),
    channelId: v.id("channels"),
    memberCount: v.number(),
    participants: v.array(v.string()),
    topic: v.optional(v.string()),
    roomName: v.optional(v.string()),
    senderName: v.optional(v.string()),
    senderAvatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => insertInboundMessage(ctx, args),
});

export const internalInsertMessage = internalMutation({
  args: {
    matrixRoomId: v.string(),
    eventId: v.string(),
    sender: v.string(),
    text: v.string(),
    direction: v.union(v.literal("in"), v.literal("out")),
    timestamp: v.number(),
    type: v.optional(v.string()),
    replyToEventId: v.optional(v.string()),
    attachmentUrl: v.optional(v.string()),
    attachmentMimeType: v.optional(v.string()),
    attachmentFileName: v.optional(v.string()),
    attachmentSize: v.optional(v.number()),
    channelId: v.id("channels"),
    memberCount: v.number(),
    participants: v.array(v.string()),
    topic: v.optional(v.string()),
    roomName: v.optional(v.string()),
    senderName: v.optional(v.string()),
    senderAvatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => insertInboundMessage(ctx, args),
});

// ---------------------------------------------------------------------------
// Outgoing message flow (dashboard → Matrix → bridge → WhatsApp/Telegram)
//
// 1. The dashboard UI calls sendMessage with the conversation ID and text.
// 2. insertOutboundMessage OPTIMISTICALLY inserts the message with a temporary
//    eventId, updates conversation metadata, logs an audit entry, and schedules
//    the Matrix delivery action.
// 3. The UI sees the message instantly; Matrix delivery is async.
// ---------------------------------------------------------------------------

export const sendMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    source: v.optional(
      v.union(v.literal("user"), v.literal("agent"), v.literal("system")),
    ),
  },
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.conversationId);
    if (!conv) throw new Error("Conversation not found");

    const messageId = await insertOutboundMessage(ctx, {
      conversationId: args.conversationId,
      matrixRoomId: conv.matrixRoomId,
      content: args.content,
      auditSource: args.source ?? "user",
    });

    // Dispatcher only reacts to inbound messages — no trigger on outbound.

    return messageId;
  },
});

/**
 * Internal version of sendMessage — used by the Chatter agent when autoSend
 * is enabled. Does NOT re-trigger the agent (avoids infinite loop).
 */
export const internalSendMessage = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.conversationId);
    if (!conv) throw new Error("Conversation not found");

    return insertOutboundMessage(ctx, {
      conversationId: args.conversationId,
      matrixRoomId: conv.matrixRoomId,
      content: args.content,
      auditSource: "agent",
      auditDetails: { autoSend: true },
    });
  },
});

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

export const addReaction = internalMutation({
  args: {
    eventId: v.string(),
    reactionKey: v.string(),
    sender: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await findMessageByEventId(ctx, args.eventId);
    if (!message) return;

    const reactions = message.reactions ?? [];
    const existing = reactions.find((r) => r.key === args.reactionKey);

    if (existing) {
      if (!existing.senders.includes(args.sender)) {
        existing.senders.push(args.sender);
      }
    } else {
      reactions.push({ key: args.reactionKey, senders: [args.sender] });
    }

    await ctx.db.patch(message._id, { reactions });
  },
});

export const removeReaction = mutation({
  args: {
    eventId: v.string(),
    reactionKey: v.string(),
    sender: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await findMessageByEventId(ctx, args.eventId);
    if (!message || !message.reactions) return;

    const reactions = message.reactions
      .map((r) => {
        if (r.key !== args.reactionKey) return r;
        return {
          ...r,
          senders: r.senders.filter((s) => s !== args.sender),
        };
      })
      .filter((r) => r.senders.length > 0);

    await ctx.db.patch(message._id, {
      reactions: reactions.length > 0 ? reactions : undefined,
    });
  },
});

// ---------------------------------------------------------------------------
// Redactions (soft-delete)
// ---------------------------------------------------------------------------

export const redactMessage = internalMutation({
  args: {
    eventId: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await findMessageByEventId(ctx, args.eventId);
    if (!message) return;

    await ctx.db.patch(message._id, { isRedacted: true });

    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "message.redact",
      source: "system",
      entity: "messages",
      entityId: message._id,
      details: JSON.stringify({ eventId: args.eventId }),
      timestamp: Date.now(),
    });
  },
});

// ---------------------------------------------------------------------------
// Edits
// ---------------------------------------------------------------------------

export const editMessage = internalMutation({
  args: {
    eventId: v.string(),
    newText: v.string(),
    editTimestamp: v.number(),
  },
  handler: async (ctx, args) => {
    const message = await findMessageByEventId(ctx, args.eventId);
    if (!message) return;

    const history = message.editHistory ?? [];
    history.push({
      text: message.text,
      editedAt: message.editedAt ?? message.timestamp,
    });

    await ctx.db.patch(message._id, {
      text: args.newText,
      editedAt: args.editTimestamp,
      editHistory: history,
    });

    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "message.edit",
      source: "system",
      entity: "messages",
      entityId: message._id,
      details: JSON.stringify({ eventId: args.eventId }),
      timestamp: args.editTimestamp,
    });
  },
});
