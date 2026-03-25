"use node";

import { generateText, tool, embed } from "ai";
import { v } from "convex/values";
import { z } from "zod";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { internalAction } from "../../_generated/server";
import { resolveEmbeddingModel, resolveLanguageModel } from "../../ai/engine";
import { buildArtifactorSystemPrompt } from "./prompt";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function getEmbeddingModel(ctx: ActionCtx) {
  const providers = await ctx.runQuery(internal.aiProviders.listInternal, {});
  const embeddingProvider = providers.find(
    (p: { isDefault: boolean; type: string }) =>
      p.isDefault && p.type === "embedding",
  );
  if (!embeddingProvider?.model) return null;
  return resolveEmbeddingModel(
    {
      provider: embeddingProvider.provider,
      apiKey: embeddingProvider.apiKey,
      baseUrl: embeddingProvider.baseUrl,
    },
    embeddingProvider.model,
  );
}

async function embedText(
  ctx: ActionCtx,
  text: string,
): Promise<number[] | null> {
  const model = await getEmbeddingModel(ctx);
  if (!model) return null;
  const { embedding } = await embed({ model, value: text });
  return embedding;
}

async function getUserRoleId(ctx: ActionCtx): Promise<Id<"roles"> | null> {
  const roles = await ctx.runQuery(internal.roles.listInternal, {});
  const userRole = (roles as Array<{ _id: Id<"roles">; name: string }>).find(
    (r) => r.name === "User",
  );
  return userRole?._id ?? null;
}

/**
 * Pre-search: for each fact, find semantically similar existing artifacts.
 * Returns a map of fact key → search results.
 */
async function preSearchFacts(
  ctx: ActionCtx,
  facts: string[],
): Promise<Map<number, { id: string; value: string; score: number }[]>> {
  const results = new Map<
    number,
    { id: string; value: string; score: number }[]
  >();

  for (let i = 0; i < facts.length; i++) {
    const fact = facts[i];
    const queryEmbedding = await embedText(ctx, fact);

    if (!queryEmbedding) {
      results.set(i, []);
      continue;
    }

    const searchResults = await ctx.vectorSearch("artifacts", "by_embedding", {
      vector: queryEmbedding,
      limit: 3,
    });

    if (searchResults.length === 0) {
      results.set(i, []);
      continue;
    }

    const docs = await ctx.runQuery(internal.artifacts.fetchByIds, {
      ids: searchResults.map((r) => r._id),
    });

    results.set(
      i,
      docs.map((doc) => {
        const scoreEntry = searchResults.find(
          (r) => r._id.toString() === doc._id.toString(),
        );
        return {
          id: doc._id.toString(),
          value: doc.value,
          score: scoreEntry?._score ?? 0,
        };
      }),
    );
  }

  return results;
}

// ---------------------------------------------------------------------------
// Tool schemas
// ---------------------------------------------------------------------------

const createSchema = z.object({
  value: z
    .string()
    .describe(
      'The self-descriptive fact to store, e.g. "User\'s home address: 123 Main St"',
    ),
});

const updateSchema = z.object({
  id: z.string().describe("The Convex ID of the existing artifact to update"),
  value: z.string().describe("The new value for the artifact"),
});

const skipSchema = z.object({
  id: z
    .string()
    .describe("The Convex ID of the existing artifact being skipped"),
  reason: z.string().describe("Brief reason for skipping"),
});

// ---------------------------------------------------------------------------
// Build AI SDK tools (closed over ActionCtx)
// ---------------------------------------------------------------------------

function buildTools(ctx: ActionCtx) {
  return {
    createArtifact: tool({
      description:
        "Create a new artifact. Use when no existing artifact matches this fact.",
      inputSchema: createSchema,
      execute: async ({ value }) => {
        const valueEmbedding = await embedText(ctx, value);
        const userRoleId = await getUserRoleId(ctx);
        const accessibleToRoles = userRoleId ? [userRoleId] : [];

        const id = await ctx.runMutation(internal.artifacts.internalCreate, {
          value,
          accessibleToRoles,
          embedding: valueEmbedding ?? undefined,
        });

        console.log(`[Artifactor] Created artifact: "${value}"`);
        return `Created artifact ${id}`;
      },
    }),

    updateArtifact: tool({
      description: "Update an existing artifact whose value has changed.",
      inputSchema: updateSchema,
      execute: async ({ id, value }) => {
        const emb = await embedText(ctx, value);

        await ctx.runMutation(internal.artifacts.internalUpdate, {
          id: id as Id<"artifacts">,
          value,
          embedding: emb ?? undefined,
        });

        console.log(`[Artifactor] Updated artifact ${id}: "${value}"`);
        return `Updated artifact ${id}`;
      },
    }),

    skipArtifact: tool({
      description:
        "Skip a fact — the existing artifact already has the same value.",
      inputSchema: skipSchema,
      execute: async ({ id, reason }) => {
        console.log(`[Artifactor] Skipped artifact ${id}: ${reason}`);
        return `Skipped ${id}`;
      },
    }),
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Process extracted facts from Dispatcher / Chatter.
 *
 * Pre-searches for existing similar artifacts, then asks the LLM
 * to create/update/skip in a single tool-calling step.
 */
export const processFacts = internalAction({
  args: {
    facts: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const { facts } = args;
    if (facts.length === 0) {
      console.log("[Artifactor] No facts to process.");
      return;
    }

    console.log(
      `[Artifactor] Processing ${facts.length} fact(s):`,
      JSON.stringify(facts),
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

    // 3. Pre-search for existing similar artifacts
    const searchResults = await preSearchFacts(ctx, facts);

    // 4. Build the prompt with facts + search results
    const factsWithMatches = facts
      .map((fact, i) => {
        const matches = searchResults.get(i) ?? [];
        const matchesBlock =
          matches.length > 0
            ? `  Existing matches:\n${matches.map((m) => `    - [id=${m.id}, score=${m.score.toFixed(3)}] "${m.value}"`).join("\n")}`
            : "  No existing matches found.";
        return `- ${fact}\n${matchesBlock}`;
      })
      .join("\n\n");

    const prompt = `Process the following facts about the user. For each fact, I've already searched for similar existing artifacts. Based on the matches, call createArtifact (new), updateArtifact (value changed), or skipArtifact (unchanged).\n\n${factsWithMatches}`;

    // 5. Single-step LLM call — tools are create/update/skip only
    try {
      await generateText({
        model,
        system: buildArtifactorSystemPrompt(),
        prompt,
        tools: buildTools(ctx),
      });
      console.log("[Artifactor] Finished processing facts.");
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("[Artifactor] Agent error:", errorMessage);
    }
  },
});
