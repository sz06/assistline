"use node";

import { Agent, createThread, saveMessage } from "@convex-dev/agent";
import { stepCountIs } from "ai";
import { v } from "convex/values";
import { components, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { internalAction } from "../../_generated/server";
import { resolveLanguageModel } from "../../ai/engine";
import type { ProfileShape } from "./helpers";
import { buildConversationSnapshot, hashString } from "./helpers";

import { buildDispatcherSystemPrompt } from "./prompt";
import {
  createContactSuggestion,
  createForwardFactsTool,
  createSearchArtifactsTool,
  createSuggestReplyTool,
  updateContactSuggestion,
} from "./tools";

// Maximum number of recent messages to include in each snapshot sent to the LLM.
const SNAPSHOT_MESSAGE_LIMIT = 30;

/**
 * Create the Dispatcher agent dynamically — we resolve the language model at
 * runtime from the user's configured AI providers.
 *
 * Roles are fetched once and baked into the system prompt so the agent
 * doesn't re-query them on every invocation.
 */
function createDispatcherAgent(
  model: ReturnType<typeof resolveLanguageModel>,
  providerId: Id<"aiProviders">,
  conversationId: Id<"conversations">,
  roles: Array<{ name: string; description?: string }>,
) {
  return new Agent(components.agent, {
    name: "Dispatcher",
    // biome-ignore lint/suspicious/noExplicitAny: AI SDK LanguageModel ↔ agent component type bridge
    languageModel: model as any,
    instructions: buildDispatcherSystemPrompt(new Date().toISOString(), roles),
    tools: {
      suggestReply: createSuggestReplyTool({ conversationId }),
      createContactSuggestion,
      updateContactSuggestion,
      forwardFacts: createForwardFactsTool({ conversationId }),
      searchArtifacts: createSearchArtifactsTool(),
    },
    maxSteps: 5,
    usageHandler: async (ctx, { usage }) => {
      const inputTokens = usage.inputTokens ?? 0;
      const outputTokens = usage.outputTokens ?? 0;
      if (inputTokens > 0 || outputTokens > 0) {
        await ctx.runMutation(
          internal.conversations.mutations.incrementTokenUsage,
          { conversationId, inputTokens, outputTokens },
        );
        await ctx.runMutation(internal.aiProviders.recordUsage, {
          id: providerId,
          tokensIn: inputTokens,
          tokensOut: outputTokens,
        });
      }
    },
  });
}

/**
 * Main Dispatcher agent entry point.
 * Called after each inbound message when a conversation has aiEnabled = true.
 *
 * Architecture — Rolling Snapshot:
 * 1. Fetch the last SNAPSHOT_MESSAGE_LIMIT messages from the DB.
 * 2. Batch-resolve Matrix sender IDs → Convex contactIds.
 * 3. Fetch contact profiles for unique contactIds → build PARTICIPANTS block.
 * 4. Build compact message lines ([contact:id] only, no repeated profile data).
 * 5. Combine into a single snapshot string and hash it.
 * 6. If the hash matches the stored lastSnapshotHash → bail out (concurrent run).
 * 7. Get-or-create the agent thread, clear old messages, save snapshot as one row.
 * 8. Run the agent — it responds with suggestReply / forwardContactNotes /
 *    forwardFacts / searchArtifacts as appropriate.
 * 9. Persist the new hash and update conversation status.
 */
export const processMessage = internalAction({
  args: {
    conversationId: v.id("conversations"),
    senderContactId: v.string(), // Convex contact ID or "user" for outgoing
    messageText: v.string(),
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

    // 2. Load roles (used in system prompt — fetched once per invocation)
    const roles = (await ctx.runQuery(
      internal.roles.listInternal,
      {},
    )) as Array<{
      name: string;
      description?: string;
    }>;

    // 3. Resolve the AI model and create the agent
    const model = resolveLanguageModel(
      {
        provider: defaultProvider.provider,
        apiKey: defaultProvider.apiKey,
        baseUrl: defaultProvider.baseUrl,
      },
      defaultProvider.model,
    );
    const dispatcher = createDispatcherAgent(
      model,
      defaultProvider._id,
      args.conversationId,
      roles,
    );
    console.log(
      `[Dispatcher] Using provider=${defaultProvider.provider} model=${defaultProvider.model}`,
    );

    // 4. Get the conversation
    const conversation = await ctx.runQuery(
      internal.conversations.queries.getByIdInternal,
      { id: args.conversationId },
    );
    if (!conversation) {
      console.error(
        "[Dispatcher] Conversation not found:",
        args.conversationId,
      );
      return;
    }

    // 5. Fetch latest messages for the snapshot (filters redacted internally)
    const messages = await ctx.runQuery(
      internal.messages.queries.getConversationHistoryQuery,
      {
        conversationId: args.conversationId,
        limit: SNAPSHOT_MESSAGE_LIMIT,
      },
    );

    if (messages.length === 0) {
      console.log("[Dispatcher] No messages to process. Skipping.");
      return;
    }

    // 6. Resolve the self-contact ID for filtering
    const selfContact = await ctx.runQuery(internal.self.getInternal);
    const selfContactId = selfContact?._id;

    // Resolve contactIds for all unique senders (batch query)
    const allSenders = [...new Set(messages.map((m) => m.sender))];
    const senderToContactId = (await ctx.runQuery(
      internal.contacts.internal.resolveContactIds,
      { matrixIds: allSenders },
    )) as Record<string, string>;

    // Filter out self-contact from unique inbound senders
    const uniqueInboundContactIds = [
      ...new Set(
        Object.entries(senderToContactId)
          .filter(([_, contactId]) => contactId !== String(selfContactId))
          .map(([_, contactId]) => contactId),
      ),
    ] as Id<"contacts">[];

    // 7a. Resolve contact profiles for the PARTICIPANTS block (unique contacts only)
    const profiles = await Promise.all(
      uniqueInboundContactIds.map(async (contactId) => ({
        contactId,
        profile: (await ctx.runQuery(
          internal.contacts.internal.getContactProfileQuery,
          {
            contactId,
          },
        )) as ProfileShape | null,
      })),
    );

    // 7b. Fetch pending contact suggestions for each participant
    const pendingSuggestionsMap = (await ctx.runQuery(
      internal.contactSuggestions.queries.listByContactIds,
      { contactIds: uniqueInboundContactIds },
    )) as Record<string, Array<{ _id: string; field: string; value: string }>>;

    // 7c. Build compact per-message lines (contactId only, no repeated profile data)
    const enrichedMessages = messages.map((m) => {
      const resolvedContactId = senderToContactId[m.sender];
      const isSelf = resolvedContactId === String(selfContactId);
      return {
        senderContactId: isSelf ? "user" : (resolvedContactId ?? "unknown"),
        text: m.text,
      };
    });

    // 7d. Merge pending suggestions into profiles for the snapshot
    const profilesWithSuggestions = profiles.map((p) => ({
      ...p,
      pendingSuggestions: pendingSuggestionsMap[p.contactId] ?? [],
    }));

    const snapshot = buildConversationSnapshot(
      enrichedMessages,
      profilesWithSuggestions,
    );
    const snapshotHash = hashString(snapshot);

    // 8. Idempotency guard — skip if another concurrent run already processed
    //    this exact snapshot (race condition protection)
    if (conversation.lastSnapshotHash === snapshotHash) {
      console.log(
        "[Dispatcher] Snapshot unchanged (concurrent run) — skipping LLM call.",
      );
      return;
    }

    // 9. Get-or-create the persistent thread for this conversation
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
      console.log(`[Dispatcher] Created thread ${threadId}`);
    }

    // 10. Clean out all previous messages from the thread (rolling snapshot —
    //     each run starts with a fresh single-row context).
    try {
      const existing = await dispatcher.listMessages(ctx, {
        threadId,
        paginationOpts: { numItems: 200, cursor: null },
        statuses: ["success"],
      });
      if (existing.page.length > 0) {
        await dispatcher.deleteMessages(ctx, {
          messageIds: existing.page.map((m) => m._id),
        });
        console.log(
          `[Dispatcher] Cleared ${existing.page.length} old thread messages.`,
        );
      }
    } catch (cleanErr: unknown) {
      console.warn(
        "[Dispatcher] Thread cleanup failed (non-fatal):",
        cleanErr instanceof Error ? cleanErr.message : String(cleanErr),
      );
    }

    // 11. Save the snapshot as a single thread row
    try {
      await saveMessage(ctx, components.agent, {
        threadId,
        agentName: "Dispatcher",
        message: { role: "user", content: snapshot },
      });
    } catch (saveErr: unknown) {
      console.warn(
        "[Dispatcher] Snapshot saveMessage failed (non-fatal):",
        saveErr instanceof Error ? saveErr.message : String(saveErr),
      );
    }

    // 12. Persist the snapshot hash before the LLM call so any concurrent
    //     invocation that reads it after us will bail out.
    const lastMessageTimestamp = messages[messages.length - 1].timestamp;
    await ctx.runMutation(internal.conversations.mutations.patchConversation, {
      conversationId: args.conversationId,
      patch: {
        lastSnapshotHash: snapshotHash,
        lastAgentSyncTimestamp: lastMessageTimestamp,
      },
    });

    // 13. Run the agent
    try {
      await dispatcher.generateText(
        ctx,
        { threadId },
        {
          prompt:
            "Process the latest events in this conversation. Respond using your tools.",
          stopWhen: stepCountIs(2),
        },
        {
          contextOptions: {
            recentMessages: 10,
          },
        },
      );

      // 14. Update conversation status after successful run
      const lastMessage = messages[messages.length - 1];
      const lastResolvedContactId = senderToContactId[lastMessage.sender];
      const lastIsSelf = lastResolvedContactId === String(selfContactId);
      await ctx.runMutation(
        internal.conversations.mutations.patchConversation,
        {
          conversationId: args.conversationId,
          patch: {
            status: lastIsSelf ? "idle" : "needs_reply",
          },
        },
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[Dispatcher] Agent error (provider=${defaultProvider.provider} model=${defaultProvider.model}):`,
        errorMessage,
      );
      console.error(
        "[Dispatcher] Hint: 'Invalid JSON response' typically means the model does not support tool calling or returned plain text instead of a tool-call payload. Try switching to a model with native function-calling support (e.g. gpt-4o, claude-3-5-sonnet, gemini-1.5-pro).",
      );
    }
  },
});

/**
 * Delete all agent thread messages for a conversation when AI is disabled.
 * Runs as a background action so the mutation that disables AI doesn't block.
 *
 * Uses deleteThreadSync which deletes the thread AND all its messages in
 * batched mutations — no need to manually list/delete messages first.
 */
export const cleanupThread = internalAction({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, { threadId }) => {
    // Create a minimal agent instance — model is not needed for deletion.
    // biome-ignore lint/suspicious/noExplicitAny: model unused for cleanup-only operation
    const agent = new Agent(components.agent, {
      name: "Dispatcher",
      languageModel: null as any,
      instructions: "",
      tools: {},
      maxSteps: 1,
    });

    try {
      await agent.deleteThreadSync(ctx, { threadId });
      console.log(
        `[Dispatcher] cleanupThread: deleted thread ${threadId} and all its messages.`,
      );
    } catch (err: unknown) {
      console.error(
        "[Dispatcher] cleanupThread failed:",
        err instanceof Error ? err.message : String(err),
      );
    }
  },
});
