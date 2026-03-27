"use node";

import { createTool, type ToolCtx } from "@convex-dev/agent";
import { z } from "zod";
import { internal } from "../../_generated/api";
import type { DataModel, Id } from "../../_generated/dataModel";
import { CONTACT_FIELD_KEYS } from "../../contacts";

// ── Shared Tools (re-exported) ───────────────────────────────────────────────
export {
  createForwardFactsTool,
  createSearchArtifactsTool,
} from "../shared/tools";

// ── Dispatcher-Only Tools ────────────────────────────────────────────────────

/**
 * Tool the LLM calls to suggest a reply for the user.
 * If reply is null/absent, clears any stale suggested reply.
 */
export function createSuggestReplyTool({
  conversationId,
}: {
  conversationId: Id<"conversations">;
}) {
  return createTool<{ reply?: string }, string, ToolCtx<DataModel>>({
    description:
      "Suggest a draft reply written as if the user is typing it. If no reply is appropriate, omit the reply field to clear any stale suggestion.",
    inputSchema: z.object({
      reply: z
        .string()
        .optional()
        .describe(
          "The draft reply text, written in the user's voice (first person). Omit if no reply is needed.",
        ),
    }),
    execute: async (ctx, { reply }): Promise<string> => {
      if (!reply) {
        // No reply — clear any stale suggestion
        await ctx.runMutation(
          internal.conversations.mutations.patchConversation,
          {
            conversationId,
            patch: { suggestedReply: undefined },
          },
        );
        return "No reply needed — cleared stale suggestion.";
      }

      // Check if autoSend is enabled on this conversation
      const conv = await ctx.runQuery(
        internal.conversations.queries.getByIdInternal,
        { id: conversationId },
      );

      if (conv?.autoSend) {
        // Auto-send: deliver the reply directly via Matrix
        await ctx.runMutation(internal.messages.mutations.internalSendMessage, {
          conversationId,
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
            conversationId,
            patch: { suggestedReply: reply },
          },
        );
      }
      return reply;
    },
  });
}

// ── Contact Suggestion Tools ─────────────────────────────────────────────────

/**
 * Tool the DA calls to create a new contact suggestion.
 * The DA should check the PARTICIPANTS block (profile + pending suggestions)
 * before calling this to avoid duplicates or subsets of existing data.
 */
export const createContactSuggestion = createTool<
  { contactId: string; field: string; value: string },
  string,
  ToolCtx<DataModel>
>({
  description: `Create a contact suggestion for a field update. Check the PARTICIPANTS block first — do NOT suggest a field if the existing profile already has that data or if a pending suggestion already covers it. Use the contactId from the PARTICIPANTS block. Allowed fields: ${CONTACT_FIELD_KEYS.join(", ")}.`,
  inputSchema: z.object({
    contactId: z
      .string()
      .describe("The Convex ID of the contact (from the PARTICIPANTS block)"),
    field: z.string().describe(`One of: ${CONTACT_FIELD_KEYS.join(", ")}`),
    value: z
      .string()
      .describe(
        'The suggested value as a string. For birthday use ISO 8601 (e.g. "1990-05-15"). For roles use comma-separated role names from AVAILABLE ROLES. For emails/phoneNumbers pass a JSON array of objects with an optional label: [{"label":"personal","value":"x@y.com"}]. For addresses/otherNames pass a JSON array of strings: ["123 Main St"].',
      ),
  }),
  execute: async (ctx, { contactId, field, value }): Promise<string> => {
    if (!value.trim()) {
      return "Empty value — skipping.";
    }

    await ctx.runMutation(internal.contactSuggestions.mutations.push, {
      contactId: contactId as Id<"contacts">,
      field,
      value,
    });

    return `Created suggestion: ${field} → "${value}" for contact ${contactId}`;
  },
});

/**
 * Tool the DA calls to update an existing pending suggestion.
 * Use when the DA discovers better/more complete info for something it
 * previously suggested (visible in the PARTICIPANTS block as a pending suggestion).
 */
export const updateContactSuggestion = createTool<
  { suggestionId: string; value: string },
  string,
  ToolCtx<DataModel>
>({
  description:
    "Update the value of an existing pending contact suggestion. Use the suggestion ID from the PARTICIPANTS block (shown as [id:xxx]).",
  inputSchema: z.object({
    suggestionId: z
      .string()
      .describe(
        "The ID of the pending suggestion to update (from the PARTICIPANTS block)",
      ),
    value: z.string().describe("The updated value for the suggestion"),
  }),
  execute: async (ctx, { suggestionId, value }): Promise<string> => {
    if (!value.trim()) {
      return "Empty value — skipping.";
    }

    await ctx.runMutation(internal.contactSuggestions.mutations.updateValue, {
      suggestionId: suggestionId as Id<"contactSuggestions">,
      value,
    });

    return `Updated suggestion ${suggestionId} → "${value}"`;
  },
});
