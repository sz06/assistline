import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation, mutation } from "../_generated/server";
import { executeActionDispatch } from "./helpers";

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

    // When AI is toggled ON, immediately trigger the agent
    if (args.aiEnabled === true) {
      await triggerAgentOnEnable(ctx, args.conversationId);
    }
  },
});

/**
 * Helper: schedule processMessage immediately when AI is first enabled.
 * Fetches the most recent message to determine direction and sender.
 */
async function triggerAgentOnEnable(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
) {
  // Fetch the most recent message in the conversation
  const lastMessage = await ctx.db
    .query("messages")
    .withIndex("by_conversationId_timestamp", (q) =>
      q.eq("conversationId", conversationId),
    )
    .order("desc")
    .first();

  if (!lastMessage) return; // No messages yet — agent will trigger on first message

  // Resolve sender contactId
  let senderContactId = "user";
  if (lastMessage.direction === "in") {
    const identity = await ctx.db
      .query("contactIdentities")
      .withIndex("by_matrixId", (q) => q.eq("matrixId", lastMessage.sender))
      .first();
    senderContactId = identity ? String(identity.contactId) : "unknown";
  }

  await ctx.scheduler.runAfter(
    0,
    internal.agents.dispatcher.agent.processMessage,
    {
      conversationId,
      senderContactId,
      messageText: lastMessage.text ?? "",
      messageDirection: lastMessage.direction,
    },
  );
}

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
    source: v.union(v.literal("user"), v.literal("agent"), v.literal("system")),
  },
  handler: async (ctx, args) => {
    await executeActionDispatch(ctx, args.actionJson, args.source);

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
      source: "user",
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
      source: "user",
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
// Internal: Sync conversation metadata (called by ingest module)
// ---------------------------------------------------------------------------

export const syncConversationMeta = internalMutation({
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
// Internal: Read receipts (called by ingest module for ephemeral events)
// ---------------------------------------------------------------------------

export const markRead = internalMutation({
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

// ---------------------------------------------------------------------------
// Internal: Typing indicators (called by ingest module for ephemeral events)
// ---------------------------------------------------------------------------

export const setTyping = internalMutation({
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
      lastAgentSyncTimestamp: v.optional(v.number()),
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

/**
 * Internal version of executeSuggestedAction — used by the Chatter agent
 * when autoAct is enabled. Executes actions immediately without storing them.
 */
export const internalExecuteSuggestedAction = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    actionJson: v.string(),
  },
  handler: async (ctx, args) => {
    await executeActionDispatch(ctx, args.actionJson, "agent", true);
  },
});
