"use node";

import { Agent } from "@convex-dev/agent";
import { v } from "convex/values";
import { components, internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";
import { resolveLanguageModel } from "../../ai/engine";
import { buildChatterSystemPrompt } from "./prompt";
import { forwardFacts } from "../shared/tools";
import { createTool, type ToolCtx } from "@convex-dev/agent";
import { z } from "zod";
import type { DataModel } from "../../_generated/dataModel";

const searchUserArtifacts = createTool<
  { query: string },
  unknown,
  ToolCtx<DataModel>
>({
  description: "Search the user's artifacts by semantic query. CRITICAL: Only call this ONCE per user message. If it returns no results or insufficient results, DO NOT call it again. Acknowledge the missing info directly to the user.",
  inputSchema: z.object({
    query: z.string().describe("The search query for artifacts"),
  }),
  execute: async (ctx, { query }) => {
    const results = await ctx.runQuery(internal.artifacts.searchArtifactsQuery, {
      roleIds: [],
      query,
    });
    if (results.length === 0) {
      throw new Error(`No artifacts found for query: "${query}". YOU MUST STOP SEARCHING NOW AND RESPOND TO THE USER IN NATURAL LANGUAGE. DO NOT CALL ANY MORE TOOLS.`);
    }
    return results;
  },
});

/**
 * Create the Chatter agent dynamically — resolves the language model at
 * runtime from the user's configured AI providers.
 */
function createChatterAgent(
  model: ReturnType<typeof resolveLanguageModel>,
) {
  return new Agent(components.agent, {
    name: "Chatter",
    // biome-ignore lint/suspicious/noExplicitAny: AI SDK LanguageModel ↔ agent component type bridge
    languageModel: model as any,
    instructions: buildChatterSystemPrompt(new Date().toISOString()),
    tools: {
      searchArtifacts: searchUserArtifacts,
      forwardFacts,
    },
    maxSteps: 3,
  });
}

/**
 * Main Chatter agent entry point.
 * Called when the user sends a message in a direct chat session.
 * The user's message is already saved to the thread; this action
 * runs the agent which appends the assistant reply.
 */
export const chat = internalAction({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Load the default language model provider
    const providers = await ctx.runQuery(internal.aiProviders.listInternal, {});
    const defaultProvider = providers.find(
      (p: { isDefault: boolean; type: string }) =>
        p.isDefault && p.type === "language",
    );
    if (!defaultProvider?.model) {
      console.warn(
        "[Chatter] No default language provider configured. Skipping.",
      );
      return;
    }

    // 2. Resolve the AI SDK language model
    const model = resolveLanguageModel(
      {
        provider: defaultProvider.provider,
        apiKey: defaultProvider.apiKey,
        baseUrl: defaultProvider.baseUrl,
      },
      defaultProvider.model,
    );

    // 3. Create the agent and run it
    const chatter = createChatterAgent(model);

    try {
      await chatter.generateText(
        ctx,
        { threadId: args.threadId },
        {}
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("[Chatter] Agent error:", errorMessage);
    }
  },
});
