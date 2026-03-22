"use node";

import { Agent, createThread, saveMessage } from "@convex-dev/agent";
import { v } from "convex/values";
import { components, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { internalAction } from "../../_generated/server";
import { resolveLanguageModel } from "../../ai/engine";
import { buildChatterSystemPrompt } from "./prompt";
import {
  getArtifacts,
  getContactProfile,
  getConversationHistory,
  listRoles,
  noReplyNeeded,
  suggestActions,
  suggestReply,
} from "./tools";

/**
 * Create the Chatter agent dynamically — we resolve the language model at
 * runtime from the user's configured AI providers.
 *
 * The conversationId is captured in the closure so the usageHandler can
 * attribute token usage to the correct conversation.
 */
function createChatterAgent(
  model: ReturnType<typeof resolveLanguageModel>,
  conversationId: Id<"conversations">,
) {
  return new Agent(components.agent, {
    name: "Chatter",
    // biome-ignore lint/suspicious/noExplicitAny: AI SDK LanguageModel ↔ agent component type bridge
    languageModel: model as any,
    instructions: buildChatterSystemPrompt(new Date().toISOString()),
    tools: {
      getContactProfile,
      getConversationHistory,
      getArtifacts,
      listRoles,
      suggestReply,
      suggestActions,
      noReplyNeeded,
    },
    maxSteps: 6,
    usageHandler: async (ctx, { usage }) => {
      const inputTokens = usage.inputTokens ?? 0;
      const outputTokens = usage.outputTokens ?? 0;
      if (inputTokens > 0 || outputTokens > 0) {
        await ctx.runMutation(
          internal.conversations.mutations.incrementTokenUsage,
          { conversationId, inputTokens, outputTokens },
        );
      }
    },
  });
}

/**
 * Main Chatter agent entry point.
 * Called after each message when a conversation has aiEnabled = true.
 *
 * The response tools (suggestReply, suggestActions, noReplyNeeded) write
 * directly to the conversation — no post-processing of tool calls needed.
 */
export const processMessage = internalAction({
  args: {
    conversationId: v.id("conversations"),
    messageText: v.string(),
    messageDirection: v.string(),
    senderName: v.optional(v.string()),
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

    // 3. Create the agent with the resolved model
    const chatter = createChatterAgent(model, args.conversationId);

    // 4. Get or create thread for this conversation
    const conversation = await ctx.runQuery(
      internal.conversations.queries.getByIdInternal,
      { id: args.conversationId },
    );
    if (!conversation) {
      console.error("[Chatter] Conversation not found:", args.conversationId);
      return;
    }

    let threadId = conversation.agentThreadId;

    if (!threadId) {
      threadId = await createThread(ctx, components.agent, {
        title: `Conversation: ${args.conversationId}`,
      });
      await ctx.runMutation(
        internal.conversations.mutations.patchConversation,
        {
          conversationId: args.conversationId,
          patch: { agentThreadId: threadId },
        },
      );
    }

    // 5. Sync the latest message into the agent thread.
    // All conversation messages are saved as "user" role because from the
    // LLM's perspective, the agent is the assistant — incoming and outgoing
    // chat messages are both *context* provided to the agent.
    const senderLabel =
      args.messageDirection === "in"
        ? `[${args.senderName ?? "Contact"}]`
        : "[User (you)]";

    await saveMessage(ctx, components.agent, {
      threadId,
      agentName: senderLabel,
      message: {
        role: "user",
        content: `${senderLabel}: ${args.messageText}`,
      },
    });

    // 6. Run the agent — tools write directly to the conversation
    const prompt = `New ${args.messageDirection === "in" ? "incoming" : "outgoing"} message in conversation ${args.conversationId}. Analyze and respond using your tools.`;

    try {
      await chatter.generateText(ctx, { threadId }, { prompt });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("[Chatter] Agent error:", errorMessage);
    }
  },
});
