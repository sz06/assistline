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

/**
 * Search the user's stored artifacts (facts, preferences, information).
 * Used by both Dispatcher and Chatter when they need context to answer a question or process a message.
 */
export function createSearchArtifactsTool() {
  return createTool<{ query: string }, string, ToolCtx<DataModel>>({
    description:
      'CRITICAL: Search the user\'s stored artifacts for facts, preferences, addresses, relationships, etc. You MUST call this tool FIRST to find missing context before asking the user for clarification. Provide a clear search query, e.g. "home address" or "dietary preferences".',
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "The semantic search query to find relevant facts about the user.",
        ),
    }),
    execute: async (ctx, { query }): Promise<string> => {
      const embedding = await ctx.runAction(internal.llm.embeddings.embedText, {
        text: query,
      });

      if (!embedding) {
        return "Search failed: could not generate embedding for query.";
      }

      const searchResults = await ctx.vectorSearch(
        "artifacts",
        "by_embedding",
        {
          vector: embedding,
          limit: 10,
        },
      );

      // Filter to meaningful relevance scores
      const relevantResults = searchResults.filter((r) => r._score >= 0.5);

      if (relevantResults.length === 0) {
        return JSON.stringify({ count: 0, results: [] });
      }

      const docs = await ctx.runQuery(internal.artifacts.fetchByIds, {
        ids: relevantResults.map((r) => r._id),
      });

      if (docs.length === 0) {
        return JSON.stringify({ count: 0, results: [] });
      }

      return JSON.stringify({
        count: docs.length,
        results: docs.map((d) => d.value),
      });
    },
  });
}
