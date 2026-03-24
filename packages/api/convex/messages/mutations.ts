import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, mutation } from "../_generated/server";
import { extractSenderInfo } from "../utils/contacts";
import { insertOutboundMessage } from "./helpers";

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

    const { platform, phone, otherName } = extractSenderInfo(
      args.sender,
      args.senderName,
    );

    if (!existingIdentity) {
      // ───── Create a brand-new contact ─────
      const contactId = await ctx.db.insert("contacts", {
        avatarUrl: args.senderAvatarUrl,
        phoneNumbers: phone ? [{ label: "Mobile", value: phone }] : undefined,
        otherNames: otherName ? [otherName] : undefined,
        lastUpdateAt: Date.now(),
      });
      await ctx.db.insert("contactIdentities", {
        contactId,
        matrixId: args.sender,
        platform,
      });
    } else {
      // ───── Update existing contact with any missing data ─────
      const contact = await ctx.db.get(existingIdentity.contactId);
      if (contact) {
        const patch: Record<string, unknown> = {};

        if (
          (!contact.phoneNumbers || contact.phoneNumbers.length === 0) &&
          phone
        ) {
          patch.phoneNumbers = [{ label: "Mobile", value: phone }];
        }

        if (!contact.avatarUrl && args.senderAvatarUrl) {
          patch.avatarUrl = args.senderAvatarUrl;
        }

        if (otherName) {
          const existing = contact.otherNames ?? [];
          if (!existing.includes(otherName)) {
            patch.otherNames = [...existing, otherName];
          }
        }

        if (Object.keys(patch).length > 0) {
          patch.lastUpdateAt = Date.now();
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
      source: "system",
      entity: "messages",
      entityId: messageId,
      details: JSON.stringify({
        conversationId,
        sender: args.sender,
        direction: args.direction,
      }),
      timestamp: args.timestamp,
    });

    // Trigger Chatter agent if AI is enabled on this conversation
    const convRecord = conversation ?? (await ctx.db.get(conversationId));
    if (convRecord?.aiEnabled) {
      // Resolve sender's contactId from the identity we know exists at this point
      const senderIdentity = await ctx.db
        .query("contactIdentities")
        .withIndex("by_matrixId", (q) => q.eq("matrixId", args.sender))
        .first();

      await ctx.scheduler.runAfter(
        0,
        internal.agents.chatter.agent.processMessage,
        {
          conversationId,
          senderContactId: senderIdentity
            ? String(senderIdentity.contactId)
            : "unknown",
          messageText: args.text ?? "",
          messageDirection: args.direction,
        },
      );
    }

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

// ---------------------------------------------------------------------------
// Outgoing message flow (dashboard → Matrix → bridge → WhatsApp/Telegram)
//
// 1. The dashboard UI calls this mutation with the conversation ID and text.
// 2. We OPTIMISTICALLY insert the message into Convex with a temporary
//    "outbound_<timestamp>" eventId. This makes the message appear instantly
//    in the chat window — the user sees it right away.
// 3. We update the conversation's metadata (lastMessageId, updatedAt, status)
//    so the conversation list reflects the new message immediately.
// 4. We schedule two async jobs via ctx.scheduler.runAfter(0, ...):
//    a) An audit log entry (fire-and-forget logging).
//    b) The sendMatrixMessage action (see matrixActions.ts), which:
//       - Reads Matrix connection details from the settings table
//       - Calls PUT /_matrix/client/v3/rooms/{roomId}/send/m.room.message/{txnId}
//         on the Dendrite homeserver
//       - The homeserver delivers the event to the mautrix bridge bot in the room
//       - The bridge bot relays it to WhatsApp/Telegram via the native protocol
//       - On success, patches our message's eventId with the real Matrix event ID
//         (e.g. "$abc123:matrix.local"), replacing the placeholder "outbound_*" id
//
// Why a mutation + scheduled action (not a single action)?
// - Mutations are fast, deterministic, and transactional — the message is saved
//   and visible in the UI within milliseconds.
// - Actions can do HTTP requests but are slower and may fail. By scheduling the
//   Matrix delivery separately, the UI stays snappy and the message is never lost
//   even if the Matrix call temporarily fails.
// ---------------------------------------------------------------------------
export const sendMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    // "manual" = dashboard user typed and sent; "auto" = Chatter agent auto-sent.
    // Flows through to the audit log so we can distinguish human vs AI actions.
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

    // Trigger Chatter agent if AI is enabled on this conversation
    if (conv.aiEnabled) {
      await ctx.scheduler.runAfter(
        0,
        internal.agents.chatter.agent.processMessage,
        {
          conversationId: args.conversationId,
          senderContactId: "user",
          messageText: args.content,
          messageDirection: "out",
        },
      );
    }

    return messageId;
  },
});

/**
 * Internal version of sendMessage — used by the Chatter agent when autoSend
 * is enabled.  Identical to the public mutation above EXCEPT it does NOT
 * re-trigger the Chatter agent, avoiding an infinite loop.
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

    // Preserve previous version in edit history
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
