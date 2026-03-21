"use node";

import { createTool, type ToolCtx } from "@convex-dev/agent";
import { embed } from "ai";
import { z } from "zod";
import { internal } from "../../_generated/api";
import type { DataModel, Id } from "../../_generated/dataModel";
import { resolveEmbeddingModel } from "../../ai/engine";

// ---------------------------------------------------------------------------
// Shared helper: resolve the default embedding model
// ---------------------------------------------------------------------------

async function getEmbeddingModel(ctx: ToolCtx<DataModel>) {
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
    },
    embeddingProvider.model,
  );
}

async function embedText(
  ctx: ToolCtx<DataModel>,
  text: string,
): Promise<number[] | null> {
  const model = await getEmbeddingModel(ctx);
  if (!model) {
    console.warn(
      "[Artifactor] No embedding provider configured. Skipping embedding.",
    );
    return null;
  }
  const { embedding } = await embed({ model, value: text });
  return embedding;
}

// ---------------------------------------------------------------------------
// Helper: resolve the "User" role ID
// ---------------------------------------------------------------------------

async function getUserRoleId(
  ctx: ToolCtx<DataModel>,
): Promise<Id<"roles"> | null> {
  const roles = await ctx.runQuery(internal.roles.listInternal, {});
  const userRole = (roles as Array<{ _id: Id<"roles">; name: string }>).find(
    (r) => r.name === "User",
  );
  return userRole?._id ?? null;
}

// ── Tools ────────────────────────────────────────────────────────────────────

/**
 * Search existing artifacts for semantically similar content.
 * Uses vector search to find the closest matches.
 */
export const searchArtifacts = createTool<
  { query: string },
  unknown,
  ToolCtx<DataModel>
>({
  description:
    "Search existing artifacts for semantically similar content. Returns the top matches with their descriptions, values, and similarity scores.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "A description of the fact to search for, e.g. 'user home address'",
      ),
  }),
  execute: async (ctx, { query }): Promise<unknown> => {
    const queryEmbedding = await embedText(ctx, query);
    if (!queryEmbedding) {
      // No embedding provider — fall back to text search
      console.warn(
        "[Artifactor] No embedding available, returning empty results.",
      );
      return [];
    }

    // Vector search returns { _id, _score }[]
    const searchResults = await ctx.vectorSearch("artifacts", "by_embedding", {
      vector: queryEmbedding,
      limit: 5,
    });

    if (searchResults.length === 0) return [];

    // Hydrate the results with full document data
    const docs = await ctx.runQuery(internal.artifacts.fetchByIds, {
      ids: searchResults.map((r) => r._id),
    });

    // Merge scores with documents
    return docs.map((doc) => {
      const scoreEntry = searchResults.find(
        (r) => r._id.toString() === doc._id.toString(),
      );
      return {
        id: doc._id,
        value: doc.value,
        description: doc.description,
        score: scoreEntry?._score ?? 0,
      };
    });
  },
});

/**
 * Create a new artifact with the given value and description.
 * Automatically embeds the description for future semantic search.
 */
export const createArtifact = createTool<
  { value: string; description: string },
  string,
  ToolCtx<DataModel>
>({
  description:
    "Create a new artifact to store a user fact. The description should be clear and searchable (e.g. 'User\\'s home address').",
  inputSchema: z.object({
    value: z.string().describe("The fact value to store"),
    description: z
      .string()
      .describe("A clear, searchable description of what this fact is"),
  }),
  execute: async (ctx, { value, description }): Promise<string> => {
    // Generate embedding for the description
    const descriptionEmbedding = await embedText(ctx, description);

    // Get the "User" role for access control
    const userRoleId = await getUserRoleId(ctx);
    const accessibleToRoles = userRoleId ? [userRoleId] : [];

    const id = await ctx.runMutation(internal.artifacts.internalCreate, {
      value,
      description,
      accessibleToRoles,
      embedding: descriptionEmbedding ?? undefined,
    });

    console.log(`[Artifactor] Created artifact: "${description}" = "${value}"`);
    return `Created artifact ${id}: ${description}`;
  },
});

/**
 * Update an existing artifact's value and/or description.
 * Re-embeds the description if it changes.
 */
export const updateArtifact = createTool<
  { id: string; value?: string; description?: string },
  string,
  ToolCtx<DataModel>
>({
  description:
    "Update an existing artifact by its ID. Use when a fact already exists but the value has changed.",
  inputSchema: z.object({
    id: z.string().describe("The Convex ID of the artifact to update"),
    value: z.string().optional().describe("The updated fact value"),
    description: z
      .string()
      .optional()
      .describe("The updated description, if it needs changing"),
  }),
  execute: async (ctx, { id, value, description }): Promise<string> => {
    // Re-embed if description changed
    let newEmbedding: number[] | undefined;
    if (description) {
      const emb = await embedText(ctx, description);
      newEmbedding = emb ?? undefined;
    }

    await ctx.runMutation(internal.artifacts.internalUpdate, {
      id: id as Id<"artifacts">,
      value,
      description,
      embedding: newEmbedding,
    });

    console.log(
      `[Artifactor] Updated artifact ${id}: value="${value ?? "(unchanged)"}", description="${description ?? "(unchanged)"}"`,
    );
    return `Updated artifact ${id}`;
  },
});

/**
 * Skip a fact that already exists with the same value.
 */
export const skipArtifact = createTool<
  { description: string; reason: string },
  string,
  ToolCtx<DataModel>
>({
  description:
    "Skip a fact that already exists as an artifact with the same value. Use when searchArtifacts returns a match with an identical value — no create or update needed.",
  inputSchema: z.object({
    description: z
      .string()
      .describe("The description of the existing artifact being skipped"),
    reason: z
      .string()
      .describe(
        "Brief reason for skipping, e.g. 'value unchanged' or 'already exists'",
      ),
  }),
  execute: async (_ctx, { description, reason }): Promise<string> => {
    console.log(`[Artifactor] Skipped artifact: "${description}" — ${reason}`);
    return `Skipped: ${description} (${reason})`;
  },
});

/**
 * Signal that all facts have been processed.
 */
export const done = createTool<
  Record<string, never>,
  string,
  ToolCtx<DataModel>
>({
  description:
    "Call this when all extracted facts have been processed (created, updated, or skipped).",
  inputSchema: z.object({}),
  execute: async (): Promise<string> => {
    console.log("[Artifactor] All facts processed.");
    return "Done — all facts processed.";
  },
});
