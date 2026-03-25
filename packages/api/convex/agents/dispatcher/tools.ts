"use node";

import { createTool, type ToolCtx } from "@convex-dev/agent";
import { z } from "zod";
import { internal } from "../../_generated/api";
import type { DataModel, Id } from "../../_generated/dataModel";
import { DispatcherMutationSchema } from "./schema";

// ── Shared Tools (re-exported) ───────────────────────────────────────────────
export { searchArtifacts, forwardFacts } from "../shared/tools";

// ── Dispatcher-Only Tools ────────────────────────────────────────────────────

/**
 * Tool the LLM calls to suggest a reply for the user.
 * If reply is null/absent, clears any stale suggested reply.
 */
export const suggestReply = createTool<
  {
    conversationId: string;
    reply?: string;
  },
  string,
  ToolCtx<DataModel>
>({
  description:
    "Suggest a draft reply written as if the user is typing it. If no reply is appropriate, omit the reply field to clear any stale suggestion.",
  inputSchema: z.object({
    conversationId: z.string().describe("The Convex conversation ID"),
    reply: z
      .string()
      .optional()
      .describe(
        "The draft reply text, written in the user's voice (first person). Omit if no reply is needed.",
      ),
  }),
  execute: async (ctx, { conversationId, reply }): Promise<string> => {
    if (!reply) {
      // No reply — clear any stale suggestion
      await ctx.runMutation(
        internal.conversations.mutations.patchConversation,
        {
          conversationId: conversationId as Id<"conversations">,
          patch: { suggestedReply: undefined },
        },
      );
      return "No reply needed — cleared stale suggestion.";
    }

    // Check if autoSend is enabled on this conversation
    const conv = await ctx.runQuery(
      internal.conversations.queries.getByIdInternal,
      { id: conversationId as Id<"conversations"> },
    );

    if (conv?.autoSend) {
      // Auto-send: deliver the reply directly via Matrix
      await ctx.runMutation(internal.messages.mutations.internalSendMessage, {
        conversationId: conversationId as Id<"conversations">,
        content: reply,
      });
      console.log(
        `[Dispatcher] Auto-sent reply for conversation ${conversationId}`,
      );
    } else {
      // Manual mode: store as a suggested reply card for user approval
      await ctx.runMutation(
        internal.conversations.mutations.patchConversation,
        {
          conversationId: conversationId as Id<"conversations">,
          patch: { suggestedReply: reply },
        },
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
      .array(DispatcherMutationSchema)
      .describe("Array of mutation actions to suggest."),
  }),
  execute: async (ctx, { conversationId, actions }): Promise<string> => {
    // Check if autoAct is enabled on this conversation
    const conv = await ctx.runQuery(
      internal.conversations.queries.getByIdInternal,
      { id: conversationId as Id<"conversations"> },
    );

    if (conv?.autoAct) {
      // Auto-act: execute each action immediately
      for (const action of actions) {
        await ctx.runMutation(
          internal.conversations.mutations.internalExecuteSuggestedAction,
          {
            conversationId: conversationId as Id<"conversations">,
            actionJson: JSON.stringify(action),
          },
        );
      }
      console.log(
        `[Dispatcher] Auto-executed ${actions.length} action(s) for conversation ${conversationId}`,
      );
      return `Auto-executed ${actions.length} action(s)`;
    }

    // Manual mode: store as suggested actions for user approval
    await ctx.runMutation(internal.conversations.mutations.patchConversation, {
      conversationId: conversationId as Id<"conversations">,
      patch: {
        suggestedActions: actions.map((a) => JSON.stringify(a)),
      },
    });
    return `Suggested ${actions.length} action(s)`;
  },
});
