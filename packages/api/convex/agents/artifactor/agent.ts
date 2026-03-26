"use node";

import { generateText, stepCountIs, tool } from "ai";
import { v } from "convex/values";
import { z } from "zod";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { internalAction } from "../../_generated/server";
import { resolveLanguageModel } from "../../ai/engine";
import { buildArtifactorSystemPrompt } from "./prompt";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function embedText(
  ctx: ActionCtx,
  text: string,
): Promise<number[] | null> {
  return await ctx.runAction(internal.ai.embeddings.embedText, { text });
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
 * Runs all embeddings + vector searches in parallel for performance.
 * Returns a map of fact index → { searchResults, queryEmbedding }.
 */
async function preSearchFacts(
  ctx: ActionCtx,
  facts: string[],
): Promise<
  Map<
    number,
    {
      matches: {
        id: string;
        type: "artifact" | "suggestion";
        value: string;
        score: number;
      }[];
      embedding: number[] | null;
    }
  >
> {
  const results = new Map<
    number,
    {
      matches: {
        id: string;
        type: "artifact" | "suggestion";
        value: string;
        score: number;
      }[];
      embedding: number[] | null;
    }
  >();

  await Promise.all(
    facts.map(async (fact, i) => {
      const queryEmbedding = await embedText(ctx, fact);

      if (!queryEmbedding) {
        results.set(i, { matches: [], embedding: null });
        return;
      }

      const [artifactResults, suggestionResults] = await Promise.all([
        ctx.vectorSearch("artifacts", "by_embedding", {
          vector: queryEmbedding,
          limit: 3,
        }),
        ctx.vectorSearch("artifactSuggestions", "by_embedding", {
          vector: queryEmbedding,
          limit: 3,
        }),
      ]);

      if (artifactResults.length === 0 && suggestionResults.length === 0) {
        results.set(i, { matches: [], embedding: queryEmbedding });
        return;
      }

      const [artifactDocs, suggestionDocs] = await Promise.all([
        ctx.runQuery(internal.artifacts.fetchByIds, {
          ids: artifactResults.map((r) => r._id as Id<"artifacts">),
        }),
        ctx.runQuery(internal.artifactSuggestions.queries.fetchByIds, {
          ids: suggestionResults.map((r) => r._id as Id<"artifactSuggestions">),
        }),
      ]);

      const formattedMatches: {
        id: string;
        type: "artifact" | "suggestion";
        value: string;
        score: number;
      }[] = [];

      for (const doc of artifactDocs as Array<{ _id: string; value: string }>) {
        const scoreEntry = artifactResults.find(
          (r) => r._id.toString() === doc._id.toString(),
        );
        formattedMatches.push({
          id: doc._id.toString(),
          type: "artifact",
          value: doc.value,
          score: scoreEntry?._score ?? 0,
        });
      }

      for (const doc of suggestionDocs as Array<{
        _id: string;
        value: string;
      }>) {
        const scoreEntry = suggestionResults.find(
          (r) => r._id.toString() === doc._id.toString(),
        );
        formattedMatches.push({
          id: doc._id.toString(),
          type: "suggestion",
          value: doc.value,
          score: scoreEntry?._score ?? 0,
        });
      }

      // Sort combined results by score highest to lowest
      formattedMatches.sort((a, b) => b.score - a.score);

      results.set(i, {
        matches: formattedMatches,
        embedding: queryEmbedding,
      });
    }),
  );

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

const updatePendingSuggestionSchema = z.object({
  suggestionId: z
    .string()
    .describe("The Convex ID of the existing pending suggestion to update"),
  value: z
    .string()
    .describe("The updated new value for the pending suggestion"),
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

function buildTools(
  ctx: ActionCtx,
  context?: {
    conversationId?: Id<"conversations">;
    sessionId?: Id<"chatSessions">;
  },
  userRoleId?: Id<"roles"> | null,
  /** Map of fact value → pre-computed embedding vector */
  embeddingCache?: Map<string, number[] | null>,
) {
  const { conversationId, sessionId } = context ?? {};

  return {
    createArtifactSuggestion: tool({
      description:
        "Suggest a new artifact. Use when no existing artifact or suggestion matches this fact.",
      inputSchema: createSchema,
      execute: async ({ value }) => {
        // Look up the cached embedding for this value
        const valueEmbedding = embeddingCache?.get(value) ?? null;

        // If no cached embedding (e.g. LLM rephrased the fact), compute one now
        const embedding = valueEmbedding ?? (await embedText(ctx, value));

        if (embedding) {
          const similarPending = await ctx.vectorSearch(
            "artifactSuggestions",
            "by_embedding",
            {
              vector: embedding,
              limit: 1,
            },
          );

          if (similarPending.length > 0 && similarPending[0]._score > 0.92) {
            console.log(
              `[Artifactor] Skipped semantically duplicate create suggestion (score: ${similarPending[0]._score}): "${value}"`,
            );
            return "Saved";
          }
        }

        await ctx.runMutation(internal.artifactSuggestions.mutations.push, {
          conversationId,
          sessionId,
          type: "create",
          value,
          embedding: embedding ?? undefined,
        });
        console.log(
          `[Artifactor] Suggested new artifact for approval: "${value}"`,
        );
        return "Saved";
      },
    }),

    updateArtifactSuggestion: tool({
      description:
        "Suggest an update to an existing artifact whose value has changed. The user must manually approve this.",
      inputSchema: updateSchema,
      execute: async ({ id, value }) => {
        // Look up the cached embedding for this value
        const valueEmbedding = embeddingCache?.get(value) ?? null;

        // If no cached embedding, compute one now
        const embedding = valueEmbedding ?? (await embedText(ctx, value));

        if (embedding) {
          const similarPending = await ctx.vectorSearch(
            "artifactSuggestions",
            "by_embedding",
            {
              vector: embedding,
              limit: 1,
            },
          );

          if (similarPending.length > 0 && similarPending[0]._score > 0.92) {
            console.log(
              `[Artifactor] Skipped semantically duplicate update suggestion (score: ${similarPending[0]._score}): "${value}"`,
            );
            return "Saved";
          }
        }

        await ctx.runMutation(internal.artifactSuggestions.mutations.push, {
          conversationId,
          sessionId,
          type: "update",
          artifactId: id as Id<"artifacts">,
          value,
          embedding: embedding ?? undefined,
        });
        console.log(
          `[Artifactor] Suggested artifact update ${id} for approval: "${value}"`,
        );
        return "Saved";
      },
    }),

    updatePendingSuggestion: tool({
      description:
        "Update an existing pending suggestion to reflect new information.",
      inputSchema: updatePendingSuggestionSchema,
      execute: async ({ suggestionId, value }) => {
        // Look up the cached embedding for this value
        const valueEmbedding = embeddingCache?.get(value) ?? null;

        // If no cached embedding, compute one now
        const embedding = valueEmbedding ?? (await embedText(ctx, value));

        await ctx.runMutation(
          internal.artifactSuggestions.mutations.internalUpdate,
          {
            id: suggestionId as Id<"artifactSuggestions">,
            value,
            embedding: embedding ?? undefined,
          },
        );

        console.log(
          `[Artifactor] Updated pending suggestion ${suggestionId}: "${value}"`,
        );
        return `Updated suggestion ${suggestionId}`;
      },
    }),

    skipFact: tool({
      description:
        "Skip a fact — an existing artifact or suggestion already has the same conceptual value.",
      inputSchema: skipSchema,
      execute: async ({ id, reason }) => {
        console.log(`[Artifactor] Skipped fact matching ${id}: ${reason}`);
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
    conversationId: v.optional(v.id("conversations")),
    sessionId: v.optional(v.id("chatSessions")),
  },
  handler: async (ctx, args) => {
    const { facts, conversationId, sessionId } = args;
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

    // 3. Pre-search for existing similar artifacts (parallelized)
    const searchResults = await preSearchFacts(ctx, facts);

    // 4. Build an embedding cache so tools can reuse pre-computed embeddings
    const embeddingCache = new Map<string, number[] | null>();
    for (const [i, result] of searchResults) {
      embeddingCache.set(facts[i], result.embedding);
    }

    // 5. Build the prompt with facts + search results
    const factsWithMatches = facts
      .map((fact, i) => {
        const result = searchResults.get(i);
        const matches = result?.matches ?? [];
        const matchesBlock =
          matches.length > 0
            ? `  Existing matches:\n${matches.map((m) => `    - [id=${m.id}, type=${m.type}, score=${m.score.toFixed(3)}] "${m.value}"`).join("\n")}`
            : "  No existing matches found.";
        return `- ${fact}\n${matchesBlock}`;
      })
      .join("\n\n");

    const prompt = `Process the following facts about the user. For each fact, I've already searched for similar existing artifacts and pending suggestions. Based on the matches, call createArtifactSuggestion (new), updateArtifactSuggestion (existing artifact value changed), updatePendingSuggestion (pending suggestion value changed), or skipFact (unchanged).\n\n${factsWithMatches}`;

    // 7. Single-step LLM call — tools are create/update/skip only
    // Hoist getUserRoleId once here so createArtifact doesn't re-query per invocation.
    const userRoleId = await getUserRoleId(ctx);
    try {
      await generateText({
        model,
        system: buildArtifactorSystemPrompt(),
        prompt,
        tools: buildTools(
          ctx,
          { conversationId, sessionId },
          userRoleId,
          embeddingCache,
        ),
        // Cap at facts.length + 1 steps: one tool call per fact plus one buffer.
        stopWhen: stepCountIs(facts.length + 1),
      });
      console.log("[Artifactor] Finished processing facts.");
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("[Artifactor] Agent error:", errorMessage);
    }
  },
});
