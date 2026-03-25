import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
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
  direction: "in" | "out";
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
    direction: args.direction,
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
    const senderIdentity = await ctx.db
      .query("contactIdentities")
      .withIndex("by_matrixId", (q) => q.eq("matrixId", args.sender))
      .first();

    await ctx.scheduler.runAfter(
      0,
      internal.agents.dispatcher.agent.processMessage,
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
  // Insert with a temporary placeholder eventId — replaced on Matrix delivery
  const messageId = await ctx.db.insert("messages", {
    conversationId: args.conversationId,
    eventId: `outbound_${Date.now().toString()}`,
    sender: "system",
    text: args.content,
    direction: "out",
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
}
