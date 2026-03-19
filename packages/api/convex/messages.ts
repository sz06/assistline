import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { extractWhatsAppPhoneNumber } from "./utils/matrix";

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
    eventId: v.string(),
    sender: v.string(),
    text: v.string(),
    direction: v.union(v.literal("in"), v.literal("out")),
    timestamp: v.number(),
    // Group & channel metadata — the listener populates these after checking room state
    channelId: v.id("channels"),
    memberCount: v.number(),
    participants: v.array(v.string()),
    topic: v.optional(v.string()),
    roomName: v.optional(v.string()),
    senderName: v.optional(v.string()),
    senderAvatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Basic deduplication
    const existing = await ctx.db
      .query("messages")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .first();
    if (existing) {
      return existing._id;
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
        channelId: args.channelId,
        memberCount: args.memberCount,
        participants: args.participants,
        topic: args.topic,
        name: args.roomName,
        updatedAt: args.timestamp,
      });
    } else {
      conversationId = conversation._id;
      // Update metadata if provided
      const patch: Record<string, unknown> = { updatedAt: args.timestamp };
      if (args.memberCount > conversation.memberCount) {
        patch.memberCount = args.memberCount;
      }
      if (args.participants.length > conversation.participants.length) {
        patch.participants = args.participants;
      }
      if (args.topic && !conversation.topic) {
        patch.topic = args.topic;
      }
      if (args.roomName && !conversation.name) {
        patch.name = args.roomName;
      }
      await ctx.db.patch(conversationId, patch);
    }

    // Ensure sender contact exists via identities
    const existingIdentity = await ctx.db
      .query("contactIdentities")
      .withIndex("by_matrixId", (q) => q.eq("matrixId", args.sender))
      .first();

    if (!existingIdentity) {
      let phoneNumbers: { label?: string; value: string }[] | undefined;
      const localpart = args.sender.split(":")[0];
      const phoneNumber = extractWhatsAppPhoneNumber(args.sender);

      if (phoneNumber) {
        phoneNumbers = [{ label: "Mobile", value: phoneNumber }];
      }

      const contactId = await ctx.db.insert("contacts", {
        name: args.senderName?.trim() || undefined,
        avatarUrl: args.senderAvatarUrl,
        phoneNumbers,
      });
      await ctx.db.insert("contactIdentities", {
        contactId,
        matrixId: args.sender,
        platform: localpart?.includes("whatsapp_") ? "whatsapp" : undefined,
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
 * to update an existing conversation's group status, name, and participants.
 */
export const syncConversationMeta = mutation({
  args: {
    matrixRoomId: v.string(),
    channelId: v.id("channels"),
    memberCount: v.number(),
    participants: v.array(v.string()),
    topic: v.optional(v.string()),
    name: v.optional(v.string()),
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
      channelId: args.channelId,
      memberCount: args.memberCount,
      participants: args.participants,
      topic: args.topic ?? conversation.topic,
      name: args.name ?? conversation.name,
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
      eventId: `outbound_${Date.now().toString()}`,
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
