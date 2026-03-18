import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    // Fetch top 50 recently updated conversations
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_updatedAt")
      .order("desc")
      .take(50);

    // Map contacts to conversations if possible
    const withDetails = await Promise.all(
      conversations.map(async (conv) => {
        // We'll search for contacts referencing this conversation if needed,
        // or just rely on the conversation's matrixRoomId to find messages/contacts.
        // For Assistline, the contact is the sender of the messages.

        const contactDetails = {
          name: conv.name ?? "Unknown",
          phone: "",
          email: "",
        };

        // Find the last message to get the sender's matrixId
        if (conv.lastMessageId) {
          const lastMsg = await ctx.db.get(conv.lastMessageId);
          if (lastMsg) {
            const contact = await ctx.db
              .query("contacts")
              .withIndex("by_matrixId", (q) => q.eq("matrixId", lastMsg.sender))
              .first();

            if (contact) {
              contactDetails.name = contact.firstName
                ? `${contact.firstName} ${contact.lastName ?? ""}`.trim()
                : (conv.name ?? contact.matrixId);

              if (contact.phoneNumbers?.length) {
                contactDetails.phone = contact.phoneNumbers[0].value;
              }
              if (contact.emails?.length) {
                contactDetails.email = contact.emails[0].value;
              }
            }
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
  },
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.id);
    if (!conv) return null;

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversationId_timestamp", (q) =>
        q.eq("conversationId", args.id),
      )
      .order("asc") // chronological
      .collect();

    const contactDetails = {
      name: conv.name ?? "Unknown",
      phone: "",
      email: "",
    };

    // Find contact info from the first incoming message
    const firstIncoming = messages.find((m) => m.direction === "in");
    if (firstIncoming) {
      const contact = await ctx.db
        .query("contacts")
        .withIndex("by_matrixId", (q) => q.eq("matrixId", firstIncoming.sender))
        .first();

      if (contact) {
        contactDetails.name = contact.firstName
          ? `${contact.firstName} ${contact.lastName ?? ""}`.trim()
          : (conv.name ?? contact.matrixId);

        if (contact.phoneNumbers?.length) {
          contactDetails.phone = contact.phoneNumbers[0].value;
        }
        if (contact.emails?.length) {
          contactDetails.email = contact.emails[0].value;
        }
      }
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
