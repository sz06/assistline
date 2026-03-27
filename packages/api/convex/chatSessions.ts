import {
  createThread,
  listUIMessages,
  saveMessage,
  syncStreams,
  vStreamArgs,
} from "@convex-dev/agent";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";

// ---------------------------------------------------------------------------
// Chat Sessions CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new chat session with a fresh agent thread.
 */
export const create = mutation({
  args: {
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const threadId = await createThread(ctx, components.agent, {});

    const sessionId = await ctx.db.insert("chatSessions", {
      title: args.title,
      threadId,
      updatedAt: Date.now(),
    });

    return { sessionId, threadId };
  },
});

/**
 * List all chat sessions, newest first.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("chatSessions")
      .withIndex("by_updatedAt")
      .order("desc")
      .collect();
  },
});

/**
 * Paginated list of chat sessions with optional title search, newest first.
 */
export const listPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const search = args.search?.trim();
    if (search) {
      return ctx.db
        .query("chatSessions")
        .withSearchIndex("search_title", (q) => q.search("title", search))
        .paginate(args.paginationOpts);
    }
    return ctx.db
      .query("chatSessions")
      .withIndex("by_updatedAt")
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

/**
 * Get a single chat session by ID.
 */
export const get = query({
  args: { id: v.id("chatSessions") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.id);
  },
});

/**
 * Rename a chat session.
 */
export const rename = mutation({
  args: {
    id: v.id("chatSessions"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { title: args.title });
  },
});

/**
 * Delete a chat session.
 */
export const remove = mutation({
  args: { id: v.id("chatSessions") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

/**
 * Send a user message in a chat session.
 * Saves the message to the agent thread, then schedules the Chatter agent.
 */
export const sendMessage = mutation({
  args: {
    sessionId: v.id("chatSessions"),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Chat session not found");

    // Save user message to the agent thread
    await saveMessage(ctx, components.agent, {
      threadId: session.threadId,
      agentName: "Chatter",
      message: { role: "user", content: args.text },
    });

    // Update session timestamp
    await ctx.db.patch(args.sessionId, { updatedAt: Date.now() });

    // Schedule the Chatter agent to generate a reply
    await ctx.scheduler.runAfter(0, internal.agents.chatter.agent.chat, {
      threadId: session.threadId,
      sessionId: session._id,
    });

    return session.threadId;
  },
});

/**
 * List messages in a chat session thread.
 * Designed to be consumed by the `useUIMessages` React hook for
 * real-time streaming support.
 */
export const listThreadMessages = query({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: v.optional(vStreamArgs),
  },
  handler: async (ctx, args) => {
    const paginated = await listUIMessages(ctx, components.agent, args);
    const streams = await syncStreams(ctx, components.agent, args);
    return { ...paginated, streams };
  },
});

/**
 * Increment the token usage for a chat session.
 * Used by the Chatter agent's usageHandler.
 */
export const incrementTokenUsage = internalMutation({
  args: {
    sessionId: v.id("chatSessions"),
    inputTokens: v.number(),
    outputTokens: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;

    await ctx.db.patch(args.sessionId, {
      aiTokensIn: (session.aiTokensIn ?? 0) + args.inputTokens,
      aiTokensOut: (session.aiTokensOut ?? 0) + args.outputTokens,
    });
  },
});
