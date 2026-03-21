"use node";

import { createTool, type ToolCtx } from "@convex-dev/agent";
import { z } from "zod";
import { internal } from "../../_generated/api";
import type { DataModel, Id } from "../../_generated/dataModel";
import { ChatterMutationSchema } from "./schema";

// ── Read-Only Tools ──────────────────────────────────────────────────────────

/**
 * Look up a contact's full profile by their Matrix ID.
 */
export const getContactProfile = createTool<
  { matrixId: string },
  unknown,
  ToolCtx<DataModel>
>({
  description:
    "Look up a contact's full profile (name, phone, email, company, roles, notes) by their Matrix ID.",
  inputSchema: z.object({
    matrixId: z
      .string()
      .describe("The Matrix user ID, e.g. @whatsapp_1234:localhost"),
  }),
  execute: async (ctx, { matrixId }): Promise<unknown> => {
    const contact = await ctx.runQuery(
      internal.contacts.getContactProfileQuery,
      { matrixId },
    );
    return contact ?? { error: "Contact not found" };
  },
});

/**
 * Retrieve the full conversation history for context.
 */
export const getConversationHistory = createTool<
  { conversationId: string; limit?: number },
  unknown,
  ToolCtx<DataModel>
>({
  description:
    "Retrieve recent messages from a conversation. Returns messages with sender, direction, text, and timestamp.",
  inputSchema: z.object({
    conversationId: z.string().describe("The Convex conversation ID"),
    limit: z.number().optional().describe("Max messages to return, default 20"),
  }),
  execute: async (ctx, { conversationId, limit }): Promise<unknown> => {
    return ctx.runQuery(internal.messages.getConversationHistoryQuery, {
      conversationId: conversationId as Id<"conversations">,
      limit: limit ?? 20,
    });
  },
});

/**
 * Search the user's knowledge base (artifacts) filtered by participant roles.
 */
export const getArtifacts = createTool<
  { conversationId: string; query: string },
  unknown,
  ToolCtx<DataModel>
>({
  description:
    "Search the user's knowledge base (memories/facts) filtered by conversation participant roles. Only returns artifacts accessible to all participants.",
  inputSchema: z.object({
    conversationId: z.string().describe("The Convex conversation ID"),
    query: z.string().describe("The search query for artifacts"),
  }),
  execute: async (ctx, { conversationId, query }): Promise<unknown> => {
    return ctx.runQuery(internal.artifacts.getArtifactsQuery, {
      conversationId: conversationId as Id<"conversations">,
      query,
    });
  },
});

// ── Response Tools (write directly to the conversation) ──────────────────────

/**
 * Tool the LLM calls to suggest a reply for the user.
 * Writes the suggestion directly to the conversation.
 */
export const suggestReply = createTool<
  {
    conversationId: string;
    reply: string;
    extractedFacts?: Record<string, string>;
  },
  string,
  ToolCtx<DataModel>
>({
  description:
    "Suggest a draft reply written as if the user is typing it. Include any extracted facts about the user.",
  inputSchema: z.object({
    conversationId: z.string().describe("The Convex conversation ID"),
    reply: z
      .string()
      .describe(
        "The draft reply text, written in the user's voice (first person).",
      ),
    extractedFacts: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        "Key facts about the USER extracted from conversation (e.g. addresses, preferences).",
      ),
  }),
  execute: async (
    ctx,
    { conversationId, reply, extractedFacts },
  ): Promise<string> => {
    await ctx.runMutation(internal.conversations.mutations.patchConversation, {
      conversationId: conversationId as Id<"conversations">,
      patch: { suggestedReply: reply },
    });
    if (extractedFacts && Object.keys(extractedFacts).length > 0) {
      console.log(
        "[Chatter] Extracted facts (for Artifact Manager):",
        JSON.stringify(extractedFacts),
      );
    }
    return reply;
  },
});

/**
 * Tool the LLM calls to suggest mutation actions (updateContact, createArtifact, assignRole).
 * Writes the suggestions directly to the conversation.
 */
export const suggestActions = createTool<
  { conversationId: string; actions: unknown[] },
  string,
  ToolCtx<DataModel>
>({
  description:
    "Suggest write operations for the user to approve. Each action is an object with a 'type' field (updateContact, createArtifact, assignRole) and relevant parameters.",
  inputSchema: z.object({
    conversationId: z.string().describe("The Convex conversation ID"),
    actions: z
      .array(ChatterMutationSchema)
      .describe("Array of mutation actions to suggest."),
  }),
  execute: async (ctx, { conversationId, actions }): Promise<string> => {
    await ctx.runMutation(internal.conversations.mutations.patchConversation, {
      conversationId: conversationId as Id<"conversations">,
      patch: {
        suggestedActions: actions.map((a) => JSON.stringify(a)),
      },
    });
    return `Suggested ${actions.length} action(s)`;
  },
});

/**
 * Tool the LLM calls when no reply is needed.
 * Clears any pending suggestion and logs extracted facts.
 */
export const noReplyNeeded = createTool<
  { conversationId: string; extractedFacts?: Record<string, string> },
  string,
  ToolCtx<DataModel>
>({
  description:
    "Call this when no reply is needed (e.g. last message was outgoing, or just a reaction). Provide any extracted facts about the user.",
  inputSchema: z.object({
    conversationId: z.string().describe("The Convex conversation ID"),
    extractedFacts: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        "Key facts about the USER extracted from conversation, if any.",
      ),
  }),
  execute: async (ctx, { conversationId, extractedFacts }): Promise<string> => {
    await ctx.runMutation(internal.conversations.mutations.patchConversation, {
      conversationId: conversationId as Id<"conversations">,
      patch: { suggestedReply: undefined },
    });
    if (extractedFacts && Object.keys(extractedFacts).length > 0) {
      console.log(
        "[Chatter] Extracted facts (for Artifact Manager):",
        JSON.stringify(extractedFacts),
      );
    }
    return "Acknowledged — no reply needed.";
  },
});
