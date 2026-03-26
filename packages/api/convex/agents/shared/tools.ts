"use node";

import { createTool, type ToolCtx } from "@convex-dev/agent";
import { z } from "zod";
import { internal } from "../../_generated/api";
import type { DataModel, Id } from "../../_generated/dataModel";

// ── Shared Tools ─────────────────────────────────────────────────────────────
// Tools used by both Dispatcher and Chatter agents.

/**
 * Forward observed facts about the user to the Artifactor agent.
 * Facts are plain descriptive strings, e.g. "home address: 123 Main St, Toronto".
 *
 * Used by both Dispatcher (from WhatsApp/Telegram conversations) and
 * Chatter (from direct chat with the user).
 *
 * @example ["home address: 123 Main St, Toronto", "prefers morning calls"]
 */
export function createForwardFactsTool({
  conversationId,
  sessionId,
}: {
  conversationId?: Id<"conversations">;
  sessionId?: Id<"chatSessions">;
}) {
  return createTool<{ facts: string[] }, string, ToolCtx<DataModel>>({
    description:
      'Forward facts about the USER to the Artifactor agent for storage. Pass as a list of descriptive strings, e.g. ["home address: 123 Main St", "prefers morning calls"].',
    inputSchema: z.object({
      facts: z
        .array(z.string())
        .describe(
          'List of plain-text facts about the user. Each entry should be a clear, self-contained statement, e.g. "home address: 123 Main St, Toronto".',
        ),
    }),
    execute: async (ctx, { facts }): Promise<string> => {
      if (facts.length === 0) {
        return "No facts to forward.";
      }
      await ctx.scheduler.runAfter(
        0,
        internal.agents.artifactor.agent.processFacts,
        {
          facts,
          conversationId,
          sessionId,
        },
      );
      return `Forwarded ${facts.length} fact(s) to Artifactor.`;
    },
  });
}
