import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { cleanPhoneNumber, isPhoneNumberLike } from "./utils/contacts";
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
    // Message type & metadata
    type: v.optional(v.string()),
    replyToEventId: v.optional(v.string()),
    // Attachment metadata
    attachmentUrl: v.optional(v.string()),
    attachmentMimeType: v.optional(v.string()),
    attachmentFileName: v.optional(v.string()),
    attachmentSize: v.optional(v.number()),
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

    // Ensure sender contact exists via identities, and keep it up to date
    const existingIdentity = await ctx.db
      .query("contactIdentities")
      .withIndex("by_matrixId", (q) => q.eq("matrixId", args.sender))
      .first();

    // Derive phone number from Matrix ID (e.g. @whatsapp_14155552671:server)
    const localpart = args.sender.split(":")[0];
    const phoneFromMatrixId = extractWhatsAppPhoneNumber(args.sender);

    // Determine if the senderName is actually a phone number (bridge uses
    // the phone number as displayname when no contact name is saved)
    const senderNameTrimmed = args.senderName?.trim() || undefined;
    const nameIsPhone = senderNameTrimmed
      ? isPhoneNumberLike(senderNameTrimmed)
      : false;

    // Build the best available phone number — prefer extraction from Matrix
    // ID (pure digits), fall back to cleaning the phone-like displayname
    const bestPhone =
      phoneFromMatrixId ??
      (nameIsPhone && senderNameTrimmed
        ? cleanPhoneNumber(senderNameTrimmed)
        : undefined);

    // Build the real display name — only use senderName if it's not a phone number
    const realName = nameIsPhone ? undefined : senderNameTrimmed;

    if (!existingIdentity) {
      // ───── Create a brand-new contact ─────
      const phoneNumbers = bestPhone
        ? [{ label: "Mobile", value: bestPhone }]
        : undefined;

      const contactId = await ctx.db.insert("contacts", {
        name: realName,
        avatarUrl: args.senderAvatarUrl,
        phoneNumbers,
      });
      await ctx.db.insert("contactIdentities", {
        contactId,
        matrixId: args.sender,
        platform: localpart?.includes("whatsapp_") ? "whatsapp" : undefined,
      });
    } else {
      // ───── Update existing contact with any missing data ─────
      const contact = await ctx.db.get(existingIdentity.contactId);
      if (contact) {
        const patch: Record<string, unknown> = {};

        // Fill name if currently empty and we have a real (non-phone) name
        if (!contact.name?.trim() && realName) {
          patch.name = realName;
        }

        // Fill phone if currently empty and we have one
        if (
          (!contact.phoneNumbers || contact.phoneNumbers.length === 0) &&
          bestPhone
        ) {
          patch.phoneNumbers = [{ label: "Mobile", value: bestPhone }];
        }

        // Fill avatar if currently empty
        if (!contact.avatarUrl && args.senderAvatarUrl) {
          patch.avatarUrl = args.senderAvatarUrl;
        }

        // Fix existing contacts where name was incorrectly set to a phone number
        if (contact.name && isPhoneNumberLike(contact.name)) {
          // Move the phone-like name to phoneNumbers if they're empty
          if (!contact.phoneNumbers || contact.phoneNumbers.length === 0) {
            patch.phoneNumbers = [
              { label: "Mobile", value: cleanPhoneNumber(contact.name) },
            ];
          }
          // Clear or replace the name
          patch.name = realName ?? undefined;
        }

        if (Object.keys(patch).length > 0) {
          await ctx.db.patch(existingIdentity.contactId, patch);
        }
      }
    }

    // Insert the actual message
    const messageId = await ctx.db.insert("messages", {
      conversationId,
      eventId: args.eventId,
      sender: args.sender,
      text: args.text,
      direction: args.direction,
      timestamp: args.timestamp,
      type:
        (args.type as
          | "text"
          | "image"
          | "video"
          | "audio"
          | "file"
          | "sticker"
          | "location"
          | "reaction"
          | "notice"
          | undefined) ?? "text",
      replyToEventId: args.replyToEventId,
      attachmentUrl: args.attachmentUrl,
      attachmentMimeType: args.attachmentMimeType,
      attachmentFileName: args.attachmentFileName,
      attachmentSize: args.attachmentSize,
    });

    // Update conversation with last message reference and bump unread for incoming
    const convPatch: Record<string, unknown> = {
      lastMessageId: messageId,
      updatedAt: args.timestamp,
    };
    if (args.direction === "in") {
      const current = conversation?.unreadCount ?? 0;
      convPatch.unreadCount = current + 1;
    }
    await ctx.db.patch(conversationId, convPatch);

    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "message.insert",
      source: "auto",
      entity: "messages",
      entityId: messageId,
      details: JSON.stringify({
        conversationId,
        sender: args.sender,
        direction: args.direction,
      }),
      timestamp: args.timestamp,
    });

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
    const now = Date.now();
    await ctx.db.patch(args.conversationId, {
      lastMessageId: messageId,
      updatedAt: now,
      status: "waiting_on_contact",
    });

    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "message.send",
      source: "manual",
      entity: "messages",
      entityId: messageId,
      details: JSON.stringify({ conversationId: args.conversationId }),
      timestamp: now,
    });

    return messageId;
  },
});

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

export const addReaction = mutation({
  args: {
    eventId: v.string(),
    reactionKey: v.string(),
    sender: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db
      .query("messages")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .first();
    if (!message) return;

    const reactions = message.reactions ?? [];
    const existing = reactions.find((r) => r.key === args.reactionKey);

    if (existing) {
      // Add sender to existing reaction if not already present
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
    const message = await ctx.db
      .query("messages")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .first();
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

export const redactMessage = mutation({
  args: {
    eventId: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db
      .query("messages")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .first();
    if (!message) return;

    await ctx.db.patch(message._id, {
      isRedacted: true,
    });

    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "message.redact",
      source: "auto",
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

export const editMessage = mutation({
  args: {
    eventId: v.string(),
    newText: v.string(),
    editTimestamp: v.number(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db
      .query("messages")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .first();
    if (!message) return;

    await ctx.db.patch(message._id, {
      text: args.newText,
      editedAt: args.editTimestamp,
    });

    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "message.edit",
      source: "auto",
      entity: "messages",
      entityId: message._id,
      details: JSON.stringify({ eventId: args.eventId }),
      timestamp: args.editTimestamp,
    });
  },
});
