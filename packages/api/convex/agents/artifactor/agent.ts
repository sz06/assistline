"use node";

import { Agent, createThread } from "@convex-dev/agent";
import { v } from "convex/values";
import { components, internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";
import { resolveLanguageModel } from "../../ai/engine";
import { buildArtifactorSystemPrompt } from "./prompt";
import {
  createArtifact,
  done,
  searchArtifacts,
  skipArtifact,
  updateArtifact,
} from "./tools";

/**
 * Create the Artifactor agent dynamically — resolves the language model
 * at runtime from the user's configured AI providers.
 */
function createArtifactorAgent(model: ReturnType<typeof resolveLanguageModel>) {
  return new Agent(components.agent, {
    name: "Artifactor",
    // biome-ignore lint/suspicious/noExplicitAny: AI SDK LanguageModel ↔ agent component type bridge
    languageModel: model as any,
    instructions: buildArtifactorSystemPrompt(),
    tools: {
      searchArtifacts,
      createArtifact,
      updateArtifact,
      skipArtifact,
      done,
    },
    maxSteps: 12, // generous — up to ~3 facts × (search + create/update) + done
  });
}

/**
 * Process extracted facts from Chatter.
 *
 * Each fact is a key-value pair (e.g. { "home_address": "123 Main St" }).
 * Artifactor will search for existing artifacts, then create or update as needed.
 */
export const processFacts = internalAction({
  args: {
    facts: v.record(v.string(), v.string()),
  },
  handler: async (ctx, args) => {
    const factEntries = Object.entries(args.facts);
    if (factEntries.length === 0) {
      console.log("[Artifactor] No facts to process.");
      return;
    }

    console.log(
      `[Artifactor] Processing ${factEntries.length} fact(s):`,
      JSON.stringify(args.facts),
    );

    // 1. Load the default language model provider
    const providers = await ctx.runQuery(internal.aiProviders.listInternal, {});
    const defaultProvider = providers.find(
      (p: { isDefault: boolean; type: string }) =>
        p.isDefault && p.type === "language",
    );
    if (!defaultProvider?.model) {
      console.warn(
        "[Artifactor] No default language provider configured. Skipping.",
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

    // 3. Create the agent
    const artifactor = createArtifactorAgent(model);

    // 4. Create a one-off thread (no persistence needed)
    const threadId = await createThread(ctx, components.agent, {
      title: "Artifactor fact processing",
    });

    // 5. Build the prompt with the facts
    const factsList = factEntries
      .map(([key, value]) => `- **${key}**: ${value}`)
      .join("\n");

    const prompt = `Process the following extracted facts about the user. For each fact, search for existing artifacts, then create or update as appropriate.\n\n${factsList}`;

    // 6. Run the agent
    try {
      await artifactor.generateText(ctx, { threadId }, { prompt });
      console.log("[Artifactor] Finished processing facts.");
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("[Artifactor] Agent error:", errorMessage);
    }
  },
});
