import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";

export const listMessages = query({
  args: {
    conversationId: v.optional(v.id("conversations")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { conversationId, limit } = args;

    let messages: any[];
    if (conversationId) {
      messages = await ctx.db
        .query("messages")
        .withIndex("by_conversationId_timestamp", (q) =>
          q.eq("conversationId", conversationId),
        )
        .take(limit ?? 50);
    } else {
      messages = await ctx.db
        .query("messages")
        .order("desc") // globally latest
        .take(limit ?? 50);
    }

    return messages;
  },
});

export const insertMessage = mutation({
  args: {
    matrixRoomId: v.string(),
    eventId: v.optional(v.string()),
    sender: v.string(),
    text: v.string(),
    direction: v.union(v.literal("in"), v.literal("out")),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    // Basic deduplication
    const eventId = args.eventId;
    if (eventId) {
      const existing = await ctx.db
        .query("messages")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .first();
      if (existing) {
        return existing._id;
      }
    }

    // Ensure conversation exists for this Matrix Room
    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_matrixRoomId", (q) =>
        q.eq("matrixRoomId", args.matrixRoomId),
      )
      .first();

    let conversationId: Id<"conversations">;
    if (!conversation) {
      conversationId = await ctx.db.insert("conversations", {
        matrixRoomId: args.matrixRoomId,
        isGroup: false, // Defaulting to false, bridge can update later
        updatedAt: args.timestamp,
      });
    } else {
      conversationId = conversation._id;
      await ctx.db.patch(conversationId, { updatedAt: args.timestamp });
    }

    // Ensure sender contact exists
    const existingContact = await ctx.db
      .query("contacts")
      .withIndex("by_matrixId", (q) => q.eq("matrixId", args.sender))
      .first();

    if (!existingContact) {
      await ctx.db.insert("contacts", {
        matrixId: args.sender,
      });
    }

    // Insert the actual message
    const messageId = await ctx.db.insert("messages", {
      conversationId,
      eventId: args.eventId,
      sender: args.sender,
      text: args.text,
      direction: args.direction,
      timestamp: args.timestamp,
    });

    // Update conversation with last message reference
    await ctx.db.patch(conversationId, { lastMessageId: messageId });

    return messageId;
  },
});

export const sendMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    // Basic verification the conversation exists
    const conv = await ctx.db.get(args.conversationId);
    if (!conv) throw new Error("Conversation not found");

    // Insert the outbound message
    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      eventId: "outbound_" + Date.now().toString(), // temporary generated ID
      sender: "dashboard_user",
      text: args.content,
      direction: "out",
      timestamp: Date.now(),
    });

    // Update conversation lastMessageId, timestamp, and status
    await ctx.db.patch(args.conversationId, {
      lastMessageId: messageId,
      updatedAt: Date.now(),
      status: "waiting_on_contact",
    });

    return messageId;
  },
});
