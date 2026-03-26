import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";

export const create = mutation({
  args: {
    value: v.string(),
    accessibleToRoles: v.array(v.id("roles")),
    expiresAt: v.optional(v.number()),
    source: v.optional(
      v.union(v.literal("user"), v.literal("agent"), v.literal("system")),
    ),
  },
  handler: async (ctx, args) => {
    const { source, ...fields } = args;
    const id = await ctx.db.insert("artifacts", {
      value: fields.value,
      accessibleToRoles: fields.accessibleToRoles,
      expiresAt: fields.expiresAt,
      updatedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "artifact.create",
      source: source ?? "user",
      entity: "artifacts",
      entityId: id,
      details: JSON.stringify({ value: args.value }),
      timestamp: Date.now(),
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("artifacts"),
    value: v.optional(v.string()),
    accessibleToRoles: v.optional(v.array(v.id("roles"))),
    expiresAt: v.optional(v.number()),
    source: v.optional(
      v.union(v.literal("user"), v.literal("agent"), v.literal("system")),
    ),
  },
  handler: async (ctx, args) => {
    const { id, source, ...patch } = args;

    const patchData: any = { ...patch, updatedAt: Date.now() };
    // Clear embedding if value is being updated
    if (patch.value !== undefined) {
      patchData.embedding = undefined;
    }

    await ctx.db.patch(id, patchData);

    // Schedule background revectorization
    if (patch.value !== undefined) {
      await ctx.scheduler.runAfter(0, internal.artifacts.revectorizeArtifact, {
        id,
        text: patch.value,
      });
    }

    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "artifact.update",
      source: source ?? "user",
      entity: "artifacts",
      entityId: id,
      details: JSON.stringify({
        value: patch.value,
      }),
      timestamp: Date.now(),
    });
    return id;
  },
});

export const get = query({
  args: { id: v.id("artifacts") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const artifacts = await ctx.db.query("artifacts").order("desc").collect();
    return artifacts.map(({ embedding, ...rest }) => ({
      ...rest,
      hasEmbedding: !!embedding,
    }));
  },
});

export const remove = mutation({
  args: {
    id: v.id("artifacts"),
    source: v.optional(
      v.union(v.literal("user"), v.literal("agent"), v.literal("system")),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    await ctx.db.delete(args.id);
    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "artifact.delete",
      source: args.source ?? "user",
      entity: "artifacts",
      entityId: args.id,
      details: JSON.stringify({ value: existing?.value }),
      timestamp: Date.now(),
    });
  },
});

export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expiredArtifacts = await ctx.db
      .query("artifacts")
      .filter((q) =>
        q.and(
          q.neq(q.field("expiresAt"), undefined),
          q.lt(q.field("expiresAt"), now),
        ),
      )
      .collect();

    let count = 0;
    for (const artifact of expiredArtifacts) {
      await ctx.db.delete(artifact._id);
      await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
        action: "artifact.expired",
        source: "system",
        entity: "artifacts",
        entityId: artifact._id,
        details: JSON.stringify({ value: artifact.value }),
        timestamp: now,
      });
      count++;
    }
    console.log(`Cleaned up ${count} expired artifacts.`);
  },
});

// ---------------------------------------------------------------------------
// Internal queries for agent tools
// ---------------------------------------------------------------------------

/**
 * Search artifacts filtered by role IDs.
 * Only artifacts accessible to at least one of the provided roles are returned.
 */
export const searchArtifactsQuery = internalQuery({
  args: {
    roleIds: v.array(v.id("roles")),
    query: v.string(),
  },
  handler: async (
    ctx,
    { roleIds, query: searchQuery },
  ): Promise<Doc<"artifacts">[]> => {
    const roleIdStrings = roleIds.map((r) => r.toString());

    const allArtifacts = await ctx.db
      .query("artifacts")
      .withSearchIndex("search_value", (q) => q.search("value", searchQuery))
      .take(40);

    return allArtifacts
      .filter((a) => {
        if (a.accessibleToRoles && a.accessibleToRoles.length > 0) {
          return a.accessibleToRoles.some((r) =>
            roleIdStrings.includes(r.toString()),
          );
        }
        return true;
      })
      .slice(0, 10);
  },
});

// ---------------------------------------------------------------------------
// Internal mutations/queries for Artifactor agent
// ---------------------------------------------------------------------------

async function performVectorSearch(
  ctx: ActionCtx,
  query: string,
  limit: number,
) {
  const embedding = await ctx.runAction(internal.ai.embeddings.embedText, {
    text: query,
  });
  if (!embedding) return [];

  const searchResults = await ctx.vectorSearch("artifacts", "by_embedding", {
    vector: embedding,
    limit,
  });

  const relevantResults = searchResults.filter(
    (r: { _score: number; _id: Id<"artifacts"> }) => r._score >= 0.5,
  );
  if (relevantResults.length === 0) return [];

  const docs = (await ctx.runQuery(internal.artifacts.fetchByIds, {
    ids: relevantResults.map((r: { _id: Id<"artifacts"> }) => r._id),
  })) as Doc<"artifacts">[];

  return docs;
}

export const semanticSearch = internalAction({
  args: {
    query: v.string(),
    roleIds: v.array(v.id("roles")),
  },
  handler: async (ctx, args): Promise<{ _id: string; value: string }[]> => {
    const docs = await performVectorSearch(ctx, args.query, 10);
    const roleIdStrings = args.roleIds.map((r: Id<"roles">) => r.toString());

    return docs
      .filter((a: Doc<"artifacts">) => {
        if (a.accessibleToRoles && a.accessibleToRoles.length > 0) {
          return a.accessibleToRoles.some((r: Id<"roles">) =>
            roleIdStrings.includes(r.toString()),
          );
        }
        return true;
      })
      .map((d: Doc<"artifacts">) => ({ _id: d._id as string, value: d.value }));
  },
});

export const vectorSearch = action({
  args: {
    query: v.string(),
  },
  handler: async (ctx, args) => {
    const docs = await performVectorSearch(ctx, args.query, 50);
    return docs.map((d: Doc<"artifacts">) => {
      const { embedding, ...rest } = d;
      return {
        ...rest,
        hasEmbedding: !!embedding,
      };
    });
  },
});

/**
 * Fetch full artifact documents by their IDs.
 * Used after ctx.vectorSearch() in action context to hydrate results.
 */
export const fetchByIds = internalQuery({
  args: {
    ids: v.array(v.id("artifacts")),
  },
  handler: async (ctx, args): Promise<Doc<"artifacts">[]> => {
    const results: Doc<"artifacts">[] = [];
    for (const id of args.ids) {
      const doc = await ctx.db.get(id);
      if (doc) results.push(doc);
    }
    return results;
  },
});

/**
 * Create an artifact with an embedding vector.
 * Used by the Artifactor agent to persist new facts.
 */
export const internalCreate = internalMutation({
  args: {
    value: v.string(),
    accessibleToRoles: v.array(v.id("roles")),
    embedding: v.optional(v.array(v.float64())),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("artifacts", {
      value: args.value,
      accessibleToRoles: args.accessibleToRoles,
      embedding: args.embedding,
      expiresAt: args.expiresAt,
      updatedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "artifact.create",
      source: "agent",
      entity: "artifacts",
      entityId: id,
      details: JSON.stringify({
        value: args.value,
        via: "artifactor",
      }),
      timestamp: Date.now(),
    });
    return id;
  },
});

/**
 * Update an artifact's value and/or embedding.
 * Used by the Artifactor agent to update existing facts.
 */
export const internalUpdate = internalMutation({
  args: {
    id: v.id("artifacts"),
    value: v.optional(v.string()),
    embedding: v.optional(v.array(v.float64())),
  },
  handler: async (ctx, args) => {
    const { id, ...patch } = args;
    await ctx.db.patch(id, {
      ...patch,
      updatedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "artifact.update",
      source: "agent",
      entity: "artifacts",
      entityId: id,
      details: JSON.stringify({
        value: patch.value,
        via: "artifactor",
      }),
      timestamp: Date.now(),
    });
    return id;
  },
});

export const getMissingEmbeddings = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("artifacts").collect();
    return all.filter((a) => !a.embedding);
  },
});

export const generateMissingEmbeddings = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ artifactsCount: number; suggestionsCount: number }> => {
    // 1. Backfill Artifacts
    const missingArtifacts = (await ctx.runQuery(
      internal.artifacts.getMissingEmbeddings,
    )) as Array<{ _id: Id<"artifacts">; value: string }>;

    let artifactsCount = 0;
    for (const artifact of missingArtifacts) {
      const embedding = await ctx.runAction(internal.ai.embeddings.embedText, {
        text: artifact.value,
      });
      if (embedding) {
        await ctx.runMutation(internal.artifacts.internalUpdate, {
          id: artifact._id,
          embedding,
        });
        artifactsCount++;
      }
    }

    // 2. Backfill Artifact Suggestions
    const missingSuggestions = (await ctx.runQuery(
      internal.artifactSuggestions.queries.getMissingEmbeddings,
    )) as Array<{ _id: Id<"artifactSuggestions">; value: string }>;

    let suggestionsCount = 0;
    for (const suggestion of missingSuggestions) {
      const embedding = await ctx.runAction(internal.ai.embeddings.embedText, {
        text: suggestion.value,
      });
      if (embedding) {
        await ctx.runMutation(
          internal.artifactSuggestions.mutations.internalUpdate,
          {
            id: suggestion._id,
            embedding,
          },
        );
        suggestionsCount++;
      }
    }

    return { artifactsCount, suggestionsCount };
  },
});

export const revectorizeArtifact = internalAction({
  args: {
    id: v.id("artifacts"),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const embedding = await ctx.runAction(internal.ai.embeddings.embedText, {
      text: args.text,
    });
    if (embedding) {
      await ctx.runMutation(internal.artifacts.internalUpdate, {
        id: args.id,
        embedding,
      });
    }
  },
});

export const listWithEmbeddings = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("artifacts").collect();
    return all.filter((a) => !!a.embedding);
  },
});

import { cosineSimilarity } from "./utils/vector";

export const getMergeSuggestions = action({
  args: {},
  handler: async (ctx) => {
    const artifacts = (await ctx.runQuery(
      internal.artifacts.listWithEmbeddings,
    )) as Array<{
      _id: Id<"artifacts">;
      value: string;
      embedding: number[];
      _creationTime: number;
    }>;

    const groups: Array<{ items: typeof artifacts }> = [];
    const used = new Set<string>();

    // O(n^2) clustering, grouping artifacts >0.85 similarity
    for (let i = 0; i < artifacts.length; i++) {
      if (used.has(artifacts[i]._id)) continue;

      const currentGroup = [artifacts[i]];
      used.add(artifacts[i]._id);

      for (let j = i + 1; j < artifacts.length; j++) {
        if (used.has(artifacts[j]._id)) continue;

        const sim = cosineSimilarity(
          artifacts[i].embedding,
          artifacts[j].embedding,
        );
        if (sim > 0.85) {
          currentGroup.push(artifacts[j]);
          used.add(artifacts[j]._id);
        }
      }

      if (currentGroup.length > 1) {
        groups.push({ items: currentGroup });
      }
    }

    // Sort groups so the most matching groups appear first, and strip embeddings to save bw.
    groups.sort((a, b) => b.items.length - a.items.length);
    return groups.map((g) => ({
      items: g.items.map(({ embedding, ...rest }) => rest),
    }));
  },
});

export const internalRemoveBatch = internalMutation({
  args: {
    ids: v.array(v.id("artifacts")),
  },
  handler: async (ctx, args) => {
    for (const id of args.ids) {
      const existing = await ctx.db.get(id);
      if (existing) {
        await ctx.db.delete(id);
        await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
          action: "artifact.delete",
          source: "user",
          entity: "artifacts",
          entityId: id,
          details: JSON.stringify({ value: existing.value, via: "merge" }),
          timestamp: Date.now(),
        });
      }
    }
  },
});

export const mergeArtifacts = action({
  args: {
    artifactIds: v.array(v.id("artifacts")),
    mergedValue: v.string(),
  },
  handler: async (ctx, args) => {
    const artifacts = (await ctx.runQuery(internal.artifacts.fetchByIds, {
      ids: args.artifactIds,
    })) as Array<{ accessibleToRoles?: Id<"roles">[] }>;

    const allRoles = new Set<string>();
    for (const a of artifacts) {
      if (a.accessibleToRoles) {
        for (const r of a.accessibleToRoles) {
          allRoles.add(r as string);
        }
      }
    }
    const mergedRoles = Array.from(allRoles) as Id<"roles">[];

    const embedding = await ctx.runAction(internal.ai.embeddings.embedText, {
      text: args.mergedValue,
    });

    await ctx.runMutation(internal.artifacts.internalCreate, {
      value: args.mergedValue,
      accessibleToRoles: mergedRoles,
      embedding: embedding ?? undefined,
    });

    await ctx.runMutation(internal.artifacts.internalRemoveBatch, {
      ids: args.artifactIds,
    });
  },
});
