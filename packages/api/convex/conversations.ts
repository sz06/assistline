import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";

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

        // Find the last message to get the sender's matrixId
        if (conv.lastMessageId) {
          const lastMsg = await ctx.db.get(conv.lastMessageId);
          if (lastMsg) {
            const identity = await ctx.db
              .query("contactIdentities")
              .withIndex("by_matrixId", (q) => q.eq("matrixId", lastMsg.sender))
              .first();

            if (identity) {
              const contact = await ctx.db.get(identity.contactId);
              if (contact) {
                contactDetails.name =
                  contact.name?.trim() || (conv.name ?? lastMsg.sender);

                if (contact.phoneNumbers?.length) {
                  contactDetails.phone = contact.phoneNumbers[0].value;
                }
                if (contact.emails?.length) {
                  contactDetails.email = contact.emails[0].value;
                }
              }
            }
          }
        }

        // For group conversations, use the room name directly
        const isGroup = (conv.memberCount ?? 0) > 2;
        if (isGroup && conv.name) {
          contactDetails.name = conv.name;
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

    const contactDetails = {
      name: conv.name ?? "Unknown",
      phone: "",
      email: "",
    };

    // Find contact info from the first incoming message
    const firstIncoming = messages.find((m) => m.direction === "in");
    if (firstIncoming) {
      const identity = await ctx.db
        .query("contactIdentities")
        .withIndex("by_matrixId", (q) => q.eq("matrixId", firstIncoming.sender))
        .first();

      if (identity) {
        const contact = await ctx.db.get(identity.contactId);
        if (contact) {
          contactDetails.name =
            contact.name?.trim() || (conv.name ?? firstIncoming.sender);

          if (contact.phoneNumbers?.length) {
            contactDetails.phone = contact.phoneNumbers[0].value;
          }
          if (contact.emails?.length) {
            contactDetails.email = contact.emails[0].value;
          }
        }
      }
    }

    // For group conversations, use the room name directly
    const isGroup = (conv.memberCount ?? 0) > 2;
    if (isGroup && conv.name) {
      contactDetails.name = conv.name;
    }

    return {
      ...conv,
      contactDetails,
      messages,
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
