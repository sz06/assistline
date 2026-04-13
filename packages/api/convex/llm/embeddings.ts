"use node";

import { embed } from "ai";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { resolveEmbeddingModel } from "./engine";

/**
 * Internal action: embed a string using the default embedding provider.
 * Returns the vector as number[], or null if no embedding provider exists.
 */
export const embedText = internalAction({
  args: {
    text: v.string(),
  },
  handler: async (ctx, args): Promise<number[] | null> => {
    const providers = await ctx.runQuery(internal.aiProviders.listInternal, {});
    const embeddingProvider = providers.find(
      (p: { isDefault: boolean; type: string }) =>
        p.isDefault && p.type === "embedding",
    );

    if (!embeddingProvider?.model) {
      console.warn(
        "[Embeddings] No default embedding provider configured. Skipping.",
      );
      return null;
    }

    const model = resolveEmbeddingModel(
      {
        provider: embeddingProvider.provider,
        apiKey: embeddingProvider.apiKey,
        baseUrl: embeddingProvider.baseUrl,
      },
      embeddingProvider.model,
    );

    const { embedding } = await embed({ model, value: args.text });

    // Normalize to exactly 1536 dimensions (the Convex vector index requirement)
    // Slicing works for larger models (like text-embedding-3-large)
    // Padding works for smaller ones
    const normalizedEmbedding =
      embedding.length > 1536
        ? embedding.slice(0, 1536)
        : [...embedding, ...Array(1536 - embedding.length).fill(0)];

    return normalizedEmbedding;
  },
});
