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

    if (conversationId) {
      return ctx.db
        .query("messages")
        .withIndex("by_conversationId_timestamp", (q) =>
          q.eq("conversationId", conversationId),
        )
        .take(limit ?? 50);
    }

    return ctx.db
      .query("messages")
      .order("desc") // globally latest
      .take(limit ?? 50);
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
    // Optional group metadata — the listener populates these after checking room state
    isGroup: v.optional(v.boolean()),
    roomName: v.optional(v.string()),
    groupId: v.optional(v.id("groups")),
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
        isGroup: args.isGroup ?? false,
        name: args.roomName,
        groupId: args.groupId,
        updatedAt: args.timestamp,
      });
    } else {
      conversationId = conversation._id;
      // Update group info if provided and conversation was previously uncategorized
      const patch: Record<string, unknown> = { updatedAt: args.timestamp };
      if (args.isGroup !== undefined && !conversation.isGroup && args.isGroup) {
        patch.isGroup = true;
      }
      if (args.roomName && !conversation.name) {
        patch.name = args.roomName;
      }
      if (args.groupId && !conversation.groupId) {
        patch.groupId = args.groupId;
      }
      await ctx.db.patch(conversationId, patch);
    }

    // Ensure sender contact exists via identities
    const existingIdentity = await ctx.db
      .query("contactIdentities")
      .withIndex("by_matrixId", (q) => q.eq("matrixId", args.sender))
      .first();

    if (!existingIdentity) {
      const contactId = await ctx.db.insert("contacts", {});
      await ctx.db.insert("contactIdentities", {
        contactId,
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

/**
 * Sync room metadata — called by the listener after fetching room state
 * to update an existing conversation's group status, name, and group link.
 */
export const syncConversationMeta = mutation({
  args: {
    matrixRoomId: v.string(),
    isGroup: v.boolean(),
    name: v.optional(v.string()),
    groupId: v.optional(v.id("groups")),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_matrixRoomId", (q) =>
        q.eq("matrixRoomId", args.matrixRoomId),
      )
      .first();

    if (!conversation) return null;

    await ctx.db.patch(conversation._id, {
      isGroup: args.isGroup,
      name: args.name ?? conversation.name,
      groupId: args.groupId ?? conversation.groupId,
      avatarUrl: args.avatarUrl ?? conversation.avatarUrl,
    });

    return conversation._id;
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
      eventId: `outbound_${Date.now().toString()}`, // temporary generated ID
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
