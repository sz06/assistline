import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { internalMutation, mutation } from "../_generated/server";

export const toggleAI = mutation({
  args: {
    conversationId: v.id("conversations"),
    aiEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.conversationId, { aiEnabled: args.aiEnabled });
  },
});

/** Update one or more AI settings on a conversation. */
export const updateAISettings = mutation({
  args: {
    conversationId: v.id("conversations"),
    aiEnabled: v.optional(v.boolean()),
    autoSend: v.optional(v.boolean()),
    autoAct: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, boolean> = {};
    if (args.aiEnabled !== undefined) patch.aiEnabled = args.aiEnabled;
    if (args.autoSend !== undefined) patch.autoSend = args.autoSend;
    if (args.autoAct !== undefined) patch.autoAct = args.autoAct;
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(args.conversationId, patch);
    }
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

/**
 * Execute a suggested action from the Chatter agent.
 * Parses the action JSON, dispatches the write, removes it from the list.
 */
export const executeSuggestedAction = mutation({
  args: {
    conversationId: v.id("conversations"),
    actionIndex: v.number(),
    actionJson: v.string(),
    source: v.union(v.literal("auto"), v.literal("manual")),
  },
  handler: async (ctx, args) => {
    const action = JSON.parse(args.actionJson) as Record<string, unknown>;
    const actionType = action.type as string;

    // Dispatch by action type
    if (actionType === "updateContact" && action.contactId) {
      const contactId =
        action.contactId as import("../_generated/dataModel").Id<"contacts">;
      const contact = await ctx.db.get(contactId);
      if (contact) {
        const patch: Record<string, unknown> = {};
        if (action.name !== undefined) patch.name = action.name;
        if (action.nickname !== undefined) patch.nickname = action.nickname;
        if (action.company !== undefined) patch.company = action.company;
        if (action.jobTitle !== undefined) patch.jobTitle = action.jobTitle;
        if (action.birthday !== undefined) patch.birthday = action.birthday;
        if (action.notes !== undefined) patch.notes = action.notes;
        if (action.emails !== undefined) patch.emails = action.emails;
        if (Object.keys(patch).length > 0) {
          await ctx.db.patch(contact._id, patch);
        }
        await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
          action: "contact.update",
          source: args.source,
          entity: "contacts",
          entityId: contact._id,
          details: JSON.stringify({
            via: "agent",
            fields: Object.keys(patch),
          }),
          timestamp: Date.now(),
        });
      }
    } else if (actionType === "createArtifact") {
      const id = await ctx.db.insert("artifacts", {
        value: action.value as string,
        description: action.description as string,
        accessibleToRoles: [],
        expiresAt: action.expiresAt as number | undefined,
        updatedAt: Date.now(),
      });
      await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
        action: "artifact.create",
        source: args.source,
        entity: "artifacts",
        entityId: id,
        details: JSON.stringify({
          description: action.description,
          via: "agent",
        }),
        timestamp: Date.now(),
      });
    } else if (actionType === "assignRole" && action.contactId) {
      await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
        action: "contact.assignRole",
        source: args.source,
        entity: "contacts",
        entityId: action.contactId as string,
        details: JSON.stringify({ roleName: action.roleName, via: "agent" }),
        timestamp: Date.now(),
      });
    }

    // Remove the executed action from the list
    const conv = await ctx.db.get(args.conversationId);
    if (conv?.suggestedActions) {
      const actions = [...conv.suggestedActions];
      actions.splice(args.actionIndex, 1);
      await ctx.db.patch(args.conversationId, {
        suggestedActions: actions.length > 0 ? actions : undefined,
      });
    }
  },
});

export const deleteConversation = mutation({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.conversationId);
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
    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "conversation.delete",
      source: "manual",
      entity: "conversations",
      entityId: args.conversationId,
      details: JSON.stringify({
        name: conv?.name,
        messageCount: messages.length,
      }),
      timestamp: Date.now(),
    });
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
    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "conversation.markAsRead",
      source: "manual",
      entity: "conversations",
      entityId: args.conversationId,
      timestamp: Date.now(),
    });

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

// ---------------------------------------------------------------------------
// Internal mutations for Chatter agent
// ---------------------------------------------------------------------------

/**
 * Patch conversation fields from internal actions (e.g. Chatter saving
 * suggestedReply, suggestedActions, currentIntent, agentThreadId).
 */
export const patchConversation = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    patch: v.object({
      suggestedReply: v.optional(v.string()),
      suggestedActions: v.optional(v.array(v.string())),
      agentThreadId: v.optional(v.string()),
      status: v.optional(
        v.union(
          v.literal("idle"),
          v.literal("needs_reply"),
          v.literal("waiting_on_contact"),
        ),
      ),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.conversationId, args.patch);
  },
});

/**
 * Atomically increment AI token usage counters on a conversation.
 * Called from the usageHandler in the Chatter agent.
 */
export const incrementTokenUsage = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    inputTokens: v.number(),
    outputTokens: v.number(),
  },
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.conversationId);
    if (!conv) return;
    await ctx.db.patch(args.conversationId, {
      aiTokensIn: (conv.aiTokensIn ?? 0) + args.inputTokens,
      aiTokensOut: (conv.aiTokensOut ?? 0) + args.outputTokens,
    });
  },
});
