"use node";

import { Agent, createThread, saveMessage } from "@convex-dev/agent";
import { v } from "convex/values";
import { components, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { internalAction } from "../../_generated/server";
import { resolveLanguageModel } from "../../ai/engine";
import { buildDispatcherSystemPrompt } from "./prompt";
import {
  forwardFacts,
  getArtifacts,
  suggestActions,
  suggestReply,
} from "./tools";

// Maximum number of messages to keep in the agent thread.
const MAX_THREAD_MESSAGES = 20;

/**
 * Create the Dispatcher agent dynamically — we resolve the language model at
 * runtime from the user's configured AI providers.
 *
 * The conversationId is captured in the closure so the usageHandler can
 * attribute token usage to the correct conversation.
 */
function createDispatcherAgent(
  model: ReturnType<typeof resolveLanguageModel>,
  conversationId: Id<"conversations">,
) {
  return new Agent(components.agent, {
    name: "Dispatcher",
    // biome-ignore lint/suspicious/noExplicitAny: AI SDK LanguageModel ↔ agent component type bridge
    languageModel: model as any,
    instructions: buildDispatcherSystemPrompt(new Date().toISOString()),
    tools: {
      getArtifacts,
      suggestReply,
      suggestActions,
      forwardFacts,
    },
    maxSteps: 1,
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

import {
  buildMessageBlock,
  buildParticipantsBlock,
  buildRolesBlock,
} from "./helpers";

/**
 * Main Dispatcher agent entry point.
 * Called after each message when a conversation has aiEnabled = true.
 *
 * Flow:
 * 1. Bootstrap: if no thread exists, create one and load last 20 messages.
 * 2. Catch-up: if thread exists, sync messages since last sync timestamp.
 * 3. Prune: delete oldest messages if thread exceeds MAX_THREAD_MESSAGES.
 * 4. Build prompt with participant profiles + available roles.
 * 5. Run the agent — it only has response tools, no context-gathering tools.
 */
export const processMessage = internalAction({
  args: {
    conversationId: v.id("conversations"),
    senderContactId: v.string(), // Convex contact ID or "user" for outgoing
    messageText: v.string(),
    messageDirection: v.string(),
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
        "[Dispatcher] No default language provider configured. Skipping.",
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
    const dispatcher = createDispatcherAgent(model, args.conversationId);

    // 4. Get the conversation
    const conversation = await ctx.runQuery(
      internal.conversations.queries.getByIdInternal,
      { id: args.conversationId },
    );
    if (!conversation) {
      console.error("[Dispatcher] Conversation not found:", args.conversationId);
      return;
    }

    let threadId = conversation.agentThreadId;

    if (!threadId) {
      // ── Bootstrap: new thread ──────────────────────────────────────────
      threadId = await createThread(ctx, components.agent, {
        title: `Conversation: ${args.conversationId}`,
      });

      // Load last 20 messages from conversation history
      const history = await ctx.runQuery(
        internal.messages.queries.getConversationHistoryQuery,
        { conversationId: args.conversationId, limit: MAX_THREAD_MESSAGES },
      );

      // Resolve senders → contactIds
      const senderMatrixIds = [...new Set(history.map((m) => m.sender))];
      const contactMap = (await ctx.runQuery(
        internal.contacts.resolveContactIds,
        { matrixIds: senderMatrixIds },
      )) as Record<string, string>;

      const block = buildMessageBlock(
        history,
        contactMap,
        "CONVERSATION HISTORY",
      );

      if (block) {
        await saveMessage(ctx, components.agent, {
          threadId,
          agentName: "Dispatcher",
          message: { role: "user", content: block.content },
        });

        await ctx.runMutation(
          internal.conversations.mutations.patchConversation,
          {
            conversationId: args.conversationId,
            patch: {
              agentThreadId: threadId,
              lastAgentSyncTimestamp: block.lastTimestamp,
            },
          },
        );
      } else {
        // No messages yet — just save the thread ID
        await ctx.runMutation(
          internal.conversations.mutations.patchConversation,
          {
            conversationId: args.conversationId,
            patch: {
              agentThreadId: threadId,
              lastAgentSyncTimestamp: Date.now(),
            },
          },
        );
      }
    } else {
      // ── Catch-up: sync new messages since last sync ────────────────────
      const sinceTimestamp = conversation.lastAgentSyncTimestamp ?? 0;

      const newMessages = await ctx.runQuery(
        internal.messages.queries.getConversationHistoryQuery,
        {
          conversationId: args.conversationId,
          limit: MAX_THREAD_MESSAGES,
          sinceTimestamp,
        },
      );

      // Resolve senders → contactIds
      const catchUpSenderIds = [...new Set(newMessages.map((m) => m.sender))];
      const catchUpContactMap = (await ctx.runQuery(
        internal.contacts.resolveContactIds,
        { matrixIds: catchUpSenderIds },
      )) as Record<string, string>;

      const block = buildMessageBlock(
        newMessages,
        catchUpContactMap,
        "CATCH-UP",
      );

      if (block) {
        await saveMessage(ctx, components.agent, {
          threadId,
          agentName: "Dispatcher",
          message: { role: "user", content: block.content },
        });

        await ctx.runMutation(
          internal.conversations.mutations.patchConversation,
          {
            conversationId: args.conversationId,
            patch: { lastAgentSyncTimestamp: block.lastTimestamp },
          },
        );
      }
    }

    // ── Prune: keep only the last MAX_THREAD_MESSAGES in the thread ─────
    try {
      const threadMessages = await dispatcher.listMessages(ctx, {
        threadId,
        paginationOpts: { numItems: 200, cursor: null },
        excludeToolMessages: true,
        statuses: ["success"],
      });

      const userMessages = threadMessages.page.filter(
        (m) => m.message?.role === "user",
      );

      if (userMessages.length > MAX_THREAD_MESSAGES) {
        const toDelete = userMessages.slice(
          0,
          userMessages.length - MAX_THREAD_MESSAGES,
        );
        const messageIds = toDelete.map((m) => m._id);
        await dispatcher.deleteMessages(ctx, { messageIds });
        console.log(
          `[Dispatcher] Pruned ${messageIds.length} old messages from thread`,
        );
      }
    } catch (pruneError: unknown) {
      console.warn(
        "[Dispatcher] Pruning failed (non-fatal):",
        pruneError instanceof Error ? pruneError.message : String(pruneError),
      );
    }

    // ── Build prompt with participant profiles + roles ───────────────────
    // Resolve ALL participant matrixIds (from conversation.participants)
    const participantMatrixIds = conversation.participants ?? [];
    const contactMap = await ctx.runQuery(internal.contacts.resolveContactIds, {
      matrixIds: participantMatrixIds,
    });

    // Fetch full profiles for each resolved contact
    const profileEntries: Array<{
      contactId: string;
      profile: Record<string, unknown> | null;
    }> = [];
    for (const [, contactId] of Object.entries(contactMap)) {
      const profile = await ctx.runQuery(
        internal.contacts.getContactProfileQuery,
        { contactId: contactId as Id<"contacts"> },
      );
      profileEntries.push({ contactId, profile });
    }

    // Fetch available roles
    const roles = await ctx.runQuery(internal.roles.listInternal, {});

    const participantsBlock = buildParticipantsBlock(profileEntries);
    const rolesBlock = buildRolesBlock(roles);

    const prompt = [
      `Process the latest events in conversation ${args.conversationId}. Respond using your tools.`,
      participantsBlock,
      rolesBlock,
    ]
      .filter(Boolean)
      .join("\n\n");

    // ── Run the agent ────────────────────────────────────────────────────
    try {
      await dispatcher.generateText(
        ctx,
        { threadId },
        { prompt },
        {
          contextOptions: {
            recentMessages: MAX_THREAD_MESSAGES,
          },
        },
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("[Dispatcher] Agent error:", errorMessage);
    }
  },
});
