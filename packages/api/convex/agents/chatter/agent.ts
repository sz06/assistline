"use node";

import { Agent } from "@convex-dev/agent";
import { v } from "convex/values";
import { components, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { internalAction } from "../../_generated/server";
import { resolveLanguageModel } from "../../llm/engine";
import {
  createForwardFactsTool,
  createSearchArtifactsTool,
} from "../shared/tools";
import { buildChatterSystemPrompt } from "./prompt";
import { createRenameChatSessionTool } from "./tools";

/**
 * Create the Chatter agent dynamically — resolves the language model at
 * runtime from the user's configured AI providers.
 */
function createChatterAgent(
  model: ReturnType<typeof resolveLanguageModel>,
  providerId: Id<"aiProviders">,
  instructions: string,
  sessionId: Id<"chatSessions">,
) {
  return new Agent(components.agent, {
    name: "Chatter",
    // biome-ignore lint/suspicious/noExplicitAny: AI SDK LanguageModel ↔ agent component type bridge
    languageModel: model as any,
    instructions,
    tools: {
      forwardFacts: createForwardFactsTool({ sessionId }),
      searchArtifacts: createSearchArtifactsTool(),
      renameChatSession: createRenameChatSessionTool({ sessionId }),
    },
    maxSteps: 3,
    usageHandler: async (ctx, { usage }) => {
      const inputTokens = usage.inputTokens ?? 0;
      const outputTokens = usage.outputTokens ?? 0;
      if (inputTokens > 0 || outputTokens > 0) {
        await ctx.runMutation(internal.chatSessions.incrementTokenUsage, {
          sessionId,
          inputTokens,
          outputTokens,
        });
        await ctx.runMutation(internal.aiProviders.recordUsage, {
          id: providerId,
          tokensIn: inputTokens,
          tokensOut: outputTokens,
        });
      }
    },
  });
}

/** Type guard for text content parts in agent thread messages. */
function extractTextFromContent(
  content: string | Array<{ type: string; text?: string }>,
): string {
  if (typeof content === "string") return content;
  return content
    .filter(
      (p): p is { type: "text"; text: string } =>
        p.type === "text" && typeof p.text === "string",
    )
    .map((p) => p.text)
    .join(" ");
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
    sessionId: v.id("chatSessions"),
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

    // 3. Build the agent
    const instructions = buildChatterSystemPrompt(new Date().toISOString());
    const chatter = createChatterAgent(
      model,
      defaultProvider._id,
      instructions,
      args.sessionId,
    );

    // 4. Run the agent
    // No explicit prompt text is needed because the user's message is already
    // appended to the thread prior to calling this handler.
    try {
      await chatter.streamText(
        ctx,
        { threadId: args.threadId },
        {},
        { saveStreamDeltas: true },
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("[Chatter] Agent error:", errorMessage);
    }
  },
});
