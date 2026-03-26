"use node";

import { Agent } from "@convex-dev/agent";
import { v } from "convex/values";
import { api, components, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { internalAction } from "../../_generated/server";
import { resolveLanguageModel } from "../../ai/engine";
import { createForwardFactsTool } from "../shared/tools";
import { buildChatterSystemPrompt } from "./prompt";

/**
 * Create the Chatter agent dynamically — resolves the language model at
 * runtime from the user's configured AI providers.
 */
function createChatterAgent(
  model: ReturnType<typeof resolveLanguageModel>,
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
    },
    maxSteps: 2,
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

    // 3. Build the base agent (needed to list messages for RAG)
    const baseInstructions = buildChatterSystemPrompt(new Date().toISOString());
    const chatter = createChatterAgent(model, baseInstructions, args.sessionId);

    // 4. Extract the last user message for RAG context
    const threadMessages = await chatter.listMessages(ctx, {
      threadId: args.threadId,
      paginationOpts: { numItems: 10, cursor: null },
      excludeToolMessages: true,
    });
    const userMessages = threadMessages.page.filter(
      (m) => m.message?.role === "user",
    );
    const lastUserMessage = userMessages[userMessages.length - 1];

    let queryText = "";
    if (lastUserMessage?.message?.content) {
      queryText = extractTextFromContent(
        lastUserMessage.message.content as
          | string
          | Array<{ type: string; text?: string }>,
      );
    }

    // 5. Perform vector search based on user's message
    let contextDocs = "";
    if (queryText) {
      const embedding = await ctx.runAction(internal.ai.embeddings.embedText, {
        text: queryText,
      });
      if (embedding) {
        const searchResults = await ctx.vectorSearch(
          "artifacts",
          "by_embedding",
          {
            vector: embedding,
            limit: 10,
          },
        );
        // C3: Only inject artifacts with a meaningful relevance score
        const relevantResults = searchResults.filter((r) => r._score >= 0.5);
        if (relevantResults.length > 0) {
          const docs = await ctx.runQuery(internal.artifacts.fetchByIds, {
            ids: relevantResults.map((r) => r._id),
          });
          if (docs.length > 0) {
            contextDocs = docs.map((d) => `- ${d.value}`).join("\n");
          }
        }
      } else {
        console.warn(
          "[Chatter] Embedding returned null — running without RAG context.",
        );
      }
    }

    // 6. Rebuild agent with final instructions (including RAG context if present)
    const finalInstructions = contextDocs
      ? `${baseInstructions}\n\n## KNOWLEDGE BASE\nHere are facts about the user retrieved from the database that may be relevant to their latest message:\n${contextDocs}`
      : baseInstructions;

    // If context changed, create a fresh agent with the updated instructions
    const finalChatter = contextDocs
      ? createChatterAgent(model, finalInstructions, args.sessionId)
      : chatter;

    try {
      await finalChatter.generateText(ctx, { threadId: args.threadId }, {});
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("[Chatter] Agent error:", errorMessage);
    }
  },
});
