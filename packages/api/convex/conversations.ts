import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { extractWhatsAppPhoneNumber } from "./utils/matrix";

/**
 * For a DM conversation, find the "other" participant (not the user) and
 * return their contact details. Uses the channel's connected phone number
 * to identify which participant is "self".
 */
async function resolveOtherParticipantContact(
  ctx: QueryCtx,
  conv: {
    participants: string[];
    channelId: Id<"channels">;
    name?: string;
  },
): Promise<{ name: string; phone: string; email: string } | null> {
  // Look up the channel to get the user's own phone number
  const channel = await ctx.db.get(conv.channelId);
  // Normalize to digits-only so "+16477127932" matches "16477127932"
  const selfPhone = channel?.phoneNumber?.replace(/\D/g, "");

  // Find the participant whose phone number does NOT match the user's
  for (const participantMatrixId of conv.participants) {
    const participantPhone = extractWhatsAppPhoneNumber(participantMatrixId);

    // Skip this participant if they match the user's phone number
    if (selfPhone && participantPhone === selfPhone) {
      continue;
    }

    // Look up this participant's contact
    const identity = await ctx.db
      .query("contactIdentities")
      .withIndex("by_matrixId", (q) => q.eq("matrixId", participantMatrixId))
      .first();

    if (identity) {
      const contact = await ctx.db.get(identity.contactId);
      if (contact) {
        return {
          name: contact.name?.trim() || (conv.name ?? participantMatrixId),
          phone: contact.phoneNumbers?.[0]?.value ?? "",
          email: contact.emails?.[0]?.value ?? "",
        };
      }
    }
  }

  return null;
}

export const list = query({
  args: {
    limit: v.optional(v.number()),
    channelId: v.optional(v.id("channels")),
  },
  handler: async (ctx, args) => {
    // Fetch recently updated conversations, optionally filtered by channel
    const conversations = args.channelId
      ? await ctx.db
          .query("conversations")
          .withIndex("by_channelId", (q) =>
            q.eq("channelId", args.channelId as Id<"channels">),
          )
          .order("desc")
          .take(args.limit ?? 20)
      : await ctx.db
          .query("conversations")
          .withIndex("by_updatedAt")
          .order("desc")
          .take(args.limit ?? 20);

    // Map contacts to conversations if possible
    const withDetails = await Promise.all(
      conversations.map(async (conv) => {
        const contactDetails = {
          name: conv.name ?? "Unknown",
          phone: "",
          email: "",
        };

        const isGroup = (conv.memberCount ?? 0) > 2;

        if (isGroup && conv.name) {
          // For group conversations, use the room name directly
          contactDetails.name = conv.name;
        } else {
          // For DMs, resolve the OTHER participant's contact
          const otherContact = await resolveOtherParticipantContact(ctx, conv);
          if (otherContact) {
            contactDetails.name = otherContact.name;
            contactDetails.phone = otherContact.phone;
            contactDetails.email = otherContact.email;
          }
        }

        return {
          ...conv,
          contactDetails,
        };
      }),
    );

    return withDetails;
  },
});

export const getWithMessages = query({
  args: {
    id: v.id("conversations"),
    messageLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.id);
    if (!conv) return null;

    const limit = args.messageLimit ?? 20;

    // Fetch the latest N messages (desc), then reverse for chronological display
    const messagesDesc = await ctx.db
      .query("messages")
      .withIndex("by_conversationId_timestamp", (q) =>
        q.eq("conversationId", args.id),
      )
      .order("desc")
      .take(limit);

    const messages = messagesDesc.reverse();

    // Resolve header contact details — for DMs, use the OTHER participant
    const contactDetails = {
      name: conv.name ?? "Unknown",
      phone: "",
      email: "",
    };

    const isGroup = (conv.memberCount ?? 0) > 2;
    if (isGroup && conv.name) {
      contactDetails.name = conv.name;
    } else {
      const otherContact = await resolveOtherParticipantContact(ctx, conv);
      if (otherContact) {
        contactDetails.name = otherContact.name;
        contactDetails.phone = otherContact.phone;
        contactDetails.email = otherContact.email;
      }
    }

    // Resolve sender display names for all messages via identity → contact
    // Cache per sender to avoid redundant DB lookups
    const senderNameCache = new Map<string, string>();

    const resolvedMessages = await Promise.all(
      messages.map(async (msg) => {
        let senderName: string | undefined;

        if (senderNameCache.has(msg.sender)) {
          senderName = senderNameCache.get(msg.sender);
        } else {
          const identity = await ctx.db
            .query("contactIdentities")
            .withIndex("by_matrixId", (q) => q.eq("matrixId", msg.sender))
            .first();

          if (identity) {
            const contact = await ctx.db.get(identity.contactId);
            if (contact) {
              senderName = contact.name?.trim() || undefined;
            }
          }

          senderNameCache.set(msg.sender, senderName ?? msg.sender);
          senderName = senderNameCache.get(msg.sender);
        }

        return { ...msg, senderName };
      }),
    );

    return {
      ...conv,
      contactDetails,
      messages: resolvedMessages,
    };
  },
});

export const toggleAI = mutation({
  args: {
    conversationId: v.id("conversations"),
    aiEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.conversationId, { aiEnabled: args.aiEnabled });
  },
});

export const dismissSuggestedReply = mutation({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.conversationId, { suggestedReply: undefined });
  },
});

export const dismissSuggestedAction = mutation({
  args: {
    conversationId: v.id("conversations"),
    actionIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.conversationId);
    if (!conv || !conv.suggestedActions) return;

    const actions = [...conv.suggestedActions];
    actions.splice(args.actionIndex, 1);

    await ctx.db.patch(args.conversationId, {
      suggestedActions: actions.length > 0 ? actions : undefined,
    });
  },
});

export const deleteConversation = mutation({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    // Delete all messages first
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversationId_timestamp", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .collect();

    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }

    // Delete conversation
    await ctx.db.delete(args.conversationId);
  },
});

// ---------------------------------------------------------------------------
// Read receipts
// ---------------------------------------------------------------------------

export const markRead = mutation({
  args: {
    matrixRoomId: v.string(),
    lastReadEventId: v.string(),
  },
  handler: async (ctx, args) => {
    const conv = await ctx.db
      .query("conversations")
      .withIndex("by_matrixRoomId", (q) =>
        q.eq("matrixRoomId", args.matrixRoomId),
      )
      .first();
    if (!conv) return;

    await ctx.db.patch(conv._id, {
      unreadCount: 0,
      lastReadEventId: args.lastReadEventId,
    });
  },
});

/** Mark a conversation as read by its Convex ID (called from the dashboard).
 *  Also sends a read receipt to Matrix so WhatsApp marks messages as read. */
export const markAsRead = mutation({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.conversationId);
    if (!conv || (conv.unreadCount ?? 0) === 0) return;

    await ctx.db.patch(args.conversationId, { unreadCount: 0 });

    // Find the latest message in this conversation to use as the read marker
    const lastMessage = await ctx.db
      .query("messages")
      .withIndex("by_conversationId_timestamp", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("desc")
      .first();

    if (lastMessage) {
      // Schedule the action to send the read receipt to Matrix/WhatsApp
      await ctx.scheduler.runAfter(0, api.matrixActions.sendReadReceipt, {
        matrixRoomId: conv.matrixRoomId,
        eventId: lastMessage.eventId,
      });
    }
  },
});

// ---------------------------------------------------------------------------
// Typing indicators
// ---------------------------------------------------------------------------

export const setTyping = mutation({
  args: {
    matrixRoomId: v.string(),
    typingUsers: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const conv = await ctx.db
      .query("conversations")
      .withIndex("by_matrixRoomId", (q) =>
        q.eq("matrixRoomId", args.matrixRoomId),
      )
      .first();
    if (!conv) return;

    await ctx.db.patch(conv._id, {
      typingUsers: args.typingUsers.length > 0 ? args.typingUsers : undefined,
    });
  },
});
