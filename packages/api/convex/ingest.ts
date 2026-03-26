import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation } from "./_generated/server";

// ---------------------------------------------------------------------------
// Ingest Module
//
// Thin orchestration layer — receives raw Matrix events from the listener
// and dispatches to the appropriate domain module internalMutations.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Conversation metadata sync (called by the listener after fetching room state)
// ---------------------------------------------------------------------------

export const handleConversationMeta = internalMutation({
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
// Bridge bot prefixes — used to detect bridge disconnect notices
// ---------------------------------------------------------------------------
const BRIDGE_BOT_PREFIXES: Record<string, "whatsapp" | "telegram"> = {
  "@whatsappbot:": "whatsapp",
  "@telegrambot:": "telegram",
};

// ---------------------------------------------------------------------------
// Main entry point — receives a raw Matrix event from the listener
// ---------------------------------------------------------------------------

export const handleMatrixEvent = internalAction({
  args: {
    // Matrix event fields
    type: v.string(),
    eventId: v.string(),
    sender: v.string(),
    originServerTs: v.number(),
    redacts: v.optional(v.string()),
    content: v.string(), // JSON-stringified event.content

    // Room metadata (provided by listener after fetching Matrix room state)
    matrixRoomId: v.string(),
    channelId: v.string(),
    memberCount: v.number(),
    participants: v.array(v.string()),
    topic: v.optional(v.string()),
    roomName: v.optional(v.string()),
    senderName: v.optional(v.string()),
    senderAvatarUrl: v.optional(v.string()),

    // Direction (listener determines this based on bot/puppet IDs)
    direction: v.union(v.literal("in"), v.literal("out")),
  },
  handler: async (ctx, args) => {
    const content = JSON.parse(args.content) as Record<string, unknown>;

    // ── Reactions ──
    if (args.type === "m.reaction") {
      const relatesTo = content["m.relates_to"] as
        | { event_id?: string; key?: string }
        | undefined;
      const targetEventId = relatesTo?.event_id;
      const reactionKey = relatesTo?.key;
      if (targetEventId && reactionKey) {
        await ctx.runMutation(internal.messages.mutations.addReaction, {
          eventId: targetEventId,
          reactionKey,
          sender: args.sender,
        });
        console.log(
          `[ingest] 😀 Reaction ${reactionKey} on ${targetEventId} by ${args.sender}`,
        );
      }
      return;
    }

    // ── Redactions (message deletions) ──
    if (args.type === "m.room.redaction") {
      const redactedEventId = args.redacts;
      if (redactedEventId) {
        await ctx.runMutation(internal.messages.mutations.redactMessage, {
          eventId: redactedEventId,
        });
        console.log(`[ingest] 🗑 Redacted ${redactedEventId} by ${args.sender}`);
      }
      return;
    }

    // ── From here: m.room.message ──
    if (args.type !== "m.room.message") return;

    // ── Bridge status notices ──
    if (content.msgtype === "m.notice") {
      const body = ((content.body as string) ?? "").toLowerCase();

      let bridgePlatform: "whatsapp" | "telegram" | undefined;
      for (const [prefix, platformType] of Object.entries(
        BRIDGE_BOT_PREFIXES,
      )) {
        if (args.sender.startsWith(prefix)) {
          bridgePlatform = platformType;
          break;
        }
      }

      if (bridgePlatform && args.channelId) {
        const isDisconnect =
          body.includes("bad_credentials") ||
          body.includes("logged out") ||
          body.includes("unknown_error");

        if (isDisconnect) {
          const errorMsg =
            (content.body as string) ?? "Bridge reported disconnection";
          console.log(
            `[ingest] ⚠ Bridge disconnect detected for ${bridgePlatform}: ${errorMsg}`,
          );
          await ctx.runMutation(internal.channels.setBridgeDisconnected, {
            id: args.channelId as Id<"channels">,
            error: errorMsg,
          });
        }
      }
    }

    // ── Message edits ──
    const relatesTo = content["m.relates_to"] as
      | {
          rel_type?: string;
          event_id?: string;
          "m.in_reply_to"?: { event_id?: string };
        }
      | undefined;

    if (relatesTo?.rel_type === "m.replace" && relatesTo.event_id) {
      const newContent = content["m.new_content"] as
        | { body?: string }
        | undefined;
      const newBody = newContent?.body ?? (content.body as string);
      if (newBody) {
        await ctx.runMutation(internal.messages.mutations.editMessage, {
          eventId: relatesTo.event_id,
          newText: newBody,
          editTimestamp: args.originServerTs,
        });
        console.log(
          `[ingest] ✏️ Edit on ${relatesTo.event_id} by ${args.sender}`,
        );
      }
      return;
    }

    // ── Determine message type and extract data ──
    const msgtype = content.msgtype as string | undefined;
    if (!msgtype) return;

    const typeMap: Record<string, string> = {
      "m.text": "text",
      "m.image": "image",
      "m.video": "video",
      "m.audio": "audio",
      "m.file": "file",
      "m.notice": "notice",
    };
    const messageType = typeMap[msgtype];
    if (!messageType) return;

    const body = (content.body as string) ?? "";
    const replyToEventId = relatesTo?.["m.in_reply_to"]?.event_id ?? undefined;

    const info = content.info as
      | { mimetype?: string; size?: number }
      | undefined;
    const attachmentUrl = content.url as string | undefined;
    const attachmentMimeType = info?.mimetype;
    const attachmentFileName =
      messageType !== "text" && messageType !== "notice"
        ? ((content.body as string) ?? undefined)
        : undefined;
    const attachmentSize = info?.size;

    await ctx.runMutation(internal.messages.mutations.internalInsertMessage, {
      matrixRoomId: args.matrixRoomId,
      eventId: args.eventId,
      sender: args.sender,
      text: body,
      direction: args.direction,
      timestamp: args.originServerTs,
      type: messageType,
      replyToEventId,
      attachmentUrl,
      attachmentMimeType,
      attachmentFileName,
      attachmentSize,
      channelId: args.channelId as Id<"channels">,
      memberCount: args.memberCount,
      participants: args.participants,
      topic: args.topic,
      roomName: args.roomName,
      senderName: args.senderName,
      senderAvatarUrl: args.senderAvatarUrl,
    });

    const isGroup = args.memberCount > 1;
    const typeLabel =
      messageType !== "text" ? ` [${messageType.toUpperCase()}]` : "";
    console.log(
      `[ingest] ${args.direction === "in" ? "⬇" : "⬆"} ${args.sender} → ${args.matrixRoomId}${isGroup ? " [GROUP]" : ""}${typeLabel} | eventId=${args.eventId}`,
    );
  },
});

// ---------------------------------------------------------------------------
// Ephemeral events (read receipts, typing indicators)
// ---------------------------------------------------------------------------

export const handleEphemeralEvent = internalMutation({
  args: {
    matrixRoomId: v.string(),
    type: v.string(),
    content: v.string(), // JSON-stringified event.content

    // Self-identity for filtering (the listener bot's own Matrix ID)
    botUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const content = JSON.parse(args.content) as Record<string, unknown>;

    // Load the user's known Matrix puppet IDs from the profile singleton.
    const userProfile = await ctx.db.query("userProfile").first();
    const selfIds = new Set(userProfile?.matrixIds ?? []);

    if (args.type === "m.receipt") {
      for (const [eventId, readers] of Object.entries(
        content as Record<string, Record<string, unknown>>,
      )) {
        const readReceipts = (readers as Record<string, unknown>)["m.read"] as
          | Record<string, unknown>
          | undefined;
        if (readReceipts) {
          for (const userId of Object.keys(readReceipts)) {
            if (userId === args.botUserId || selfIds.has(userId)) {
              // Use the conversations domain mutation
              const conv = await ctx.db
                .query("conversations")
                .withIndex("by_matrixRoomId", (q) =>
                  q.eq("matrixRoomId", args.matrixRoomId),
                )
                .first();
              if (conv) {
                await ctx.db.patch(conv._id, {
                  unreadCount: 0,
                  lastReadEventId: eventId,
                });
                console.log(
                  `[ingest] ✓ Read receipt: ${args.matrixRoomId} → ${eventId}`,
                );
              }
            }
          }
        }
      }
    }

    if (args.type === "m.typing") {
      const typingUserIds = (content.user_ids ?? []) as string[];
      const others = typingUserIds.filter(
        (id) => id !== args.botUserId && !selfIds.has(id),
      );
      const conv = await ctx.db
        .query("conversations")
        .withIndex("by_matrixRoomId", (q) =>
          q.eq("matrixRoomId", args.matrixRoomId),
        )
        .first();
      if (conv) {
        await ctx.db.patch(conv._id, {
          typingUsers: others.length > 0 ? others : undefined,
        });
      }
    }
  },
});
