import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { syncContactHandles } from "../contacts/shared";
import { extractSenderInfo } from "../utils/contacts";

// ---------------------------------------------------------------------------
// Message type union — shared across insert paths
// ---------------------------------------------------------------------------

export type MessageType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "file"
  | "sticker"
  | "location"
  | "reaction"
  | "notice";

// ---------------------------------------------------------------------------
// Insert an inbound message from the Matrix sync loop
//
// Shared by:
//  - insertMessage (public mutation — used by SimulatorPage)
//  - internalInsertMessage (internal — used by ingest module)
// ---------------------------------------------------------------------------

export interface InboundMessageArgs {
  matrixRoomId: string;
  eventId: string;
  sender: string;
  text: string;
  isSelf: boolean; // true if the sender is the user's own contact
  timestamp: number;
  type?: string;
  replyToEventId?: string;
  attachmentUrl?: string;
  attachmentMimeType?: string;
  attachmentFileName?: string;
  attachmentSize?: number;
  channelId: Id<"channels">;
  memberCount: number;
  participants: string[];
  topic?: string;
  roomName?: string;
  senderName?: string;
  senderAvatarUrl?: string;
}

export async function insertInboundMessage(
  ctx: MutationCtx,
  args: InboundMessageArgs,
): Promise<Id<"messages">> {
  // Basic deduplication
  const existingMsg = await findMessageByEventId(ctx, args.eventId);
  if (existingMsg) return existingMsg._id;

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

  // Ensure sender contact exists, keep up to date
  await upsertSenderContact(ctx, {
    sender: args.sender,
    senderName: args.senderName,
    senderAvatarUrl: args.senderAvatarUrl,
  });

  // Insert the actual message
  const messageId = await ctx.db.insert("messages", {
    conversationId,
    eventId: args.eventId,
    sender: args.sender,
    text: args.text,
    timestamp: args.timestamp,
    type: (args.type as MessageType | undefined) ?? "text",
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
  if (!args.isSelf) {
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
    }),
    timestamp: args.timestamp,
  });

  // Trigger Dispatcher agent if AI is enabled on this conversation.
  // 500ms debounce — gives Convex time to process other near-simultaneous
  // messages; the idempotency hash guard in processMessage handles any
  // remaining duplicates.
  const convRecord = conversation ?? (await ctx.db.get(conversationId));
  if (convRecord?.aiEnabled) {
    let senderContactId = "unknown";
    if (args.isSelf) {
      senderContactId = "user";
    } else {
      const senderIdentity = await ctx.db
        .query("contactIdentities")
        .withIndex("by_matrixId", (q) => q.eq("matrixId", args.sender))
        .first();
      if (senderIdentity) {
        senderContactId = String(senderIdentity.contactId);
      }
    }

    await ctx.scheduler.runAfter(
      500,
      internal.agents.dispatcher.agent.processMessage,
      {
        conversationId,
        senderContactId,
        messageText: args.text ?? "",
      },
    );
  }

  return messageId;
}

// ---------------------------------------------------------------------------
// Insert an outbound message (dashboard → Matrix → bridge → WhatsApp)
//
// Shared by:
//  - sendMessage (public — user typed in dashboard)
//  - internalSendMessage (internal — Chatter agent auto-send)
// ---------------------------------------------------------------------------

export async function insertOutboundMessage(
  ctx: MutationCtx,
  args: {
    conversationId: Id<"conversations">;
    matrixRoomId: string;
    content: string;
    auditSource: "user" | "agent" | "system";
    auditDetails?: Record<string, unknown>;
  },
): Promise<Id<"messages">> {
  // Resolve the sender to the real self-puppet Matrix ID for this channel.
  const conv = await ctx.db.get(args.conversationId);
  let sender = "system"; // fallback if channel has no puppet ID
  if (conv) {
    const channel = await ctx.db.get(conv.channelId);
    if (channel?.selfPuppetId) {
      sender = channel.selfPuppetId;
    }
  }

  // Insert with a temporary placeholder eventId — replaced on Matrix delivery
  const messageId = await ctx.db.insert("messages", {
    conversationId: args.conversationId,
    eventId: `outbound_${Date.now().toString()}`,
    sender,
    text: args.content,
    timestamp: Date.now(),
  });

  const now = Date.now();
  await ctx.db.patch(args.conversationId, {
    lastMessageId: messageId,
    updatedAt: now,
    status: "waiting_on_contact",
  });

  await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
    action: "message.send",
    source: args.auditSource,
    entity: "messages",
    entityId: messageId,
    details: JSON.stringify({
      conversationId: args.conversationId,
      ...args.auditDetails,
    }),
    timestamp: now,
  });

  await ctx.scheduler.runAfter(0, internal.matrixActions.sendMatrixMessage, {
    matrixRoomId: args.matrixRoomId,
    messageId,
    content: args.content,
  });

  return messageId;
}

// ---------------------------------------------------------------------------
// Find a message by its Matrix event ID — used by reaction/redact/edit ops
// ---------------------------------------------------------------------------

export async function findMessageByEventId(
  ctx: MutationCtx,
  eventId: string,
): Promise<Doc<"messages"> | null> {
  return ctx.db
    .query("messages")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .first();
}

// ---------------------------------------------------------------------------
// Upsert sender contact from Matrix identity
// ---------------------------------------------------------------------------

/**
 * Automatic contact generation and enrichment function that runs behind the scenes
 * whenever a new inbound message is received.
 *
 * Intercepts the raw Matrix Sender ID of incoming messages (e.g. `@whatsapp_14165551234:matrix.local`)
 * and performs the following tasks:
 *
 * 1. Automatic Contact Creation: If this is the first time the person has messaged,
 *    it creates a new `contacts` and `contactIdentities` record so they instantly
 *    appear in the dashboard.
 * 2. Handle Parsing (Phone/Email Extraction): Automatically parses the Matrix ID to logically
 *    extract their E.164 phone number, name, or metadata, inserting it into `contactHandles`.
 * 3. Opportunistic Updates ("Upsert"): If the contact exists but is missing an avatar, display
 *    name, or phone number dynamically provided by the recent event, it opportunistically patches
 *    the contact record to add the missing information without overriding hand-entered data.
 */
async function upsertSenderContact(
  ctx: MutationCtx,
  args: {
    sender: string;
    senderName?: string;
    senderAvatarUrl?: string;
  },
): Promise<void> {
  const existingIdentity = await ctx.db
    .query("contactIdentities")
    .withIndex("by_matrixId", (q) => q.eq("matrixId", args.sender))
    .first();

  const { platform, phone, otherName } = extractSenderInfo(
    args.sender,
    args.senderName,
  );

  if (!existingIdentity) {
    const contactId = await ctx.db.insert("contacts", {
      avatarUrl: args.senderAvatarUrl,
      otherNames: otherName ? [otherName] : undefined,
      lastUpdateAt: Date.now(),
    });
    await ctx.db.insert("contactIdentities", {
      contactId,
      matrixId: args.sender,
      platform,
    });

    // Also sync to the new handles table
    if (phone) {
      await syncContactHandles(ctx, contactId, [
        { label: "Mobile", value: phone },
      ]);
    }
  } else {
    const contact = await ctx.db.get(existingIdentity.contactId);
    if (contact) {
      const patch: Record<string, unknown> = {};

      const existingHandles = await ctx.db
        .query("contactHandles")
        .withIndex("by_contactId", (q) => q.eq("contactId", contact._id))
        .collect();

      const hasPhone = existingHandles.some((h) => h.type === "phone");

      if (!hasPhone && phone) {
        let formattedPhone = phone.replace(/[\s\-()]/g, "");
        if (/^\d+$/.test(formattedPhone)) {
          formattedPhone = `+${formattedPhone}`;
        }
        await ctx.db.insert("contactHandles", {
          contactId: contact._id,
          type: "phone",
          value: formattedPhone,
          label: "Mobile",
        });
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
}
