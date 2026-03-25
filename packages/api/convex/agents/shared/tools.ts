"use node";

import { createTool, type ToolCtx } from "@convex-dev/agent";
import { z } from "zod";
import { internal } from "../../_generated/api";
import type { DataModel, Id } from "../../_generated/dataModel";

// ── Shared Tools ─────────────────────────────────────────────────────────────
// Tools used by both Dispatcher and Chatter agents.

/**
 * Search the user's artifacts filtered by role IDs.
 * Each caller resolves the relevant roles and passes them in.
 */
export const searchArtifacts = createTool<
  { query: string; roleIds?: string[] },
  unknown,
  ToolCtx<DataModel>
>({
  description:
    "Search the user's artifacts by semantic query. When fetching context for a specific contact, provide their role IDs. If searching generally or for the direct user, omit roleIds to search all artifacts.",
  inputSchema: z.object({
    query: z.string().describe("The search query for artifacts"),
    roleIds: z
      .array(z.string())
      .optional()
      .describe("Optional array of role IDs to filter accessible artifacts by"),
  }),
  execute: async (ctx, { query, roleIds }): Promise<unknown> => {
    return ctx.runQuery(internal.artifacts.searchArtifactsQuery, {
      roleIds: (roleIds ?? []) as Id<"roles">[],
      query,
    });
  },
});

/**
 * Forward observed facts about the user to the Artifactor agent.
 * Used by both Dispatcher (from WhatsApp/Telegram conversations) and
 * Chatter (from direct chat with the user).
 */
export const forwardFacts = createTool<
  { facts: string[] },
  string,
  ToolCtx<DataModel>
>({
  description:
    "Forward facts about the USER to the Artifactor agent for storage. These are things the user reveals about themselves — preferences, addresses, dates, relationships, professional info.",
  inputSchema: z.object({
    facts: z
      .array(z.string())
      .describe(
        'An array of fact strings, e.g. ["Lives in Toronto", "Prefers dark mode"]',
      ),
  }),
  execute: async (ctx, { facts }): Promise<string> => {
    if (facts.length === 0) {
      return "No facts to forward.";
    }
    await ctx.scheduler.runAfter(
      0,
      internal.agents.artifactor.agent.processFacts,
      { facts },
    );
    return `Forwarded ${facts.length} fact(s) to Artifactor.`;
  },
});
