import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";

export const getMergeCandidates = query({
  args: {
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // 1. Fetch all contact handles
    const allHandles = await ctx.db.query("contactHandles").collect();

    // 2. Map value -> array of contactIds
    const handleValueMap = new Map<string, Array<Id<"contacts">>>();
    for (const h of allHandles) {
      if (!handleValueMap.has(h.value)) {
        handleValueMap.set(h.value, []);
      }
      handleValueMap.get(h.value)!.push(h.contactId);
    }

    // 3. Build Adjacency List (graph of contacts)
    // Edges exist between any two contacts that share a handle value
    const adj = new Map<Id<"contacts">, Set<Id<"contacts">>>();
    for (const ids of handleValueMap.values()) {
      const uniqueIds = Array.from(new Set(ids));
      if (uniqueIds.length > 1) {
        for (const id of uniqueIds) {
          if (!adj.has(id)) adj.set(id, new Set());
          for (const otherId of uniqueIds) {
            if (id !== otherId) adj.get(id)!.add(otherId);
          }
        }
      }
    }

    // 4. Find Connected Components
    const visited = new Set<Id<"contacts">>();
    const components: Array<Array<Id<"contacts">>> = [];

    for (const startId of adj.keys()) {
      if (!visited.has(startId)) {
        const component: Array<Id<"contacts">> = [];
        const queue = [startId];
        visited.add(startId);

        while (queue.length > 0) {
          const current = queue.shift()!;
          component.push(current);

          const neighbors = adj.get(current) ?? new Set();
          for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
              visited.add(neighbor);
              queue.push(neighbor);
            }
          }
        }

        if (component.length > 1) {
          components.push(component);
        }
      }
    }

    // 4.5. Find isolated name-based components
    const allContacts = await ctx.db.query("contacts").collect();
    const nameBuckets = new Map<string, Array<Id<"contacts">>>();

    for (const c of allContacts) {
      const namesToBucket = [];
      if (c.name) namesToBucket.push(c.name);
      if (c.otherNames) namesToBucket.push(...c.otherNames);

      for (const rawName of namesToBucket) {
        if (!rawName) continue;
        const normalized = rawName.trim().toLowerCase();
        if (!normalized) continue;

        if (!nameBuckets.has(normalized)) nameBuckets.set(normalized, []);
        const bucket = nameBuckets.get(normalized)!;
        if (!bucket.includes(c._id)) {
          bucket.push(c._id);
        }
      }
    }

    for (const bucket of nameBuckets.values()) {
      if (bucket.length > 1) {
        // If none of these contacts share ANY handles (are not in adj graph)
        // Then this is a completely isolated name match and should surface.
        const isInHandleComponent = bucket.some((id) => adj.has(id));
        if (!isInHandleComponent) {
          // We push only the FIRST contact as a solitary anchor component.
          // The rest will automatically be swept up by the similarContacts lookup.
          components.push([bucket[0]]);
        }
      }
    }

    // 5. Sort components deterministically (e.g., by smallest ID)
    components.sort((a, b) => {
      const minA = [...a].sort()[0];
      const minB = [...b].sort()[0];
      return minA.localeCompare(minB);
    });

    const totalSets = components.length;

    // 6. Paginate components before heavy metadata loading
    const limit = args.limit ?? 10;
    const offset = args.offset ?? 0;
    const paginatedComponents = components.slice(offset, offset + limit);

    // 7. Populate candidate sets with rich metadata
    const results = [];
    for (const componentIds of paginatedComponents) {
      const contacts = [];
      const handledContactIds = new Set<string>();

      for (const id of componentIds) {
        handledContactIds.add(id);
        const c = await ctx.db.get(id);
        if (c) {
          const handles = await ctx.db
            .query("contactHandles")
            .withIndex("by_contactId", (q) => q.eq("contactId", id))
            .collect();

          const identities = await ctx.db
            .query("contactIdentities")
            .withIndex("by_contactId", (q) => q.eq("contactId", id))
            .collect();

          contacts.push({
            contact: c,
            handles,
            identities,
          });
        }
      }

      // Find similar contacts by precise name/otherName matches
      const similarContacts = [];
      const distinctNames = new Set(
        contacts
          .flatMap((c) => {
            const names = [];
            if (c.contact.name) names.push(c.contact.name);
            if (c.contact.otherNames) names.push(...c.contact.otherNames);
            return names;
          })
          .filter(Boolean) as string[],
      );

      for (const name of distinctNames) {
        const normalizedName = name.trim().toLowerCase();
        const matchIds = nameBuckets.get(normalizedName) || [];

        for (const matchId of matchIds) {
          if (!handledContactIds.has(matchId)) {
            handledContactIds.add(matchId);
            const match = await ctx.db.get(matchId);
            if (!match) continue;

            const handles = await ctx.db
              .query("contactHandles")
              .withIndex("by_contactId", (q) => q.eq("contactId", match._id))
              .collect();
            const identities = await ctx.db
              .query("contactIdentities")
              .withIndex("by_contactId", (q) => q.eq("contactId", match._id))
              .collect();
            similarContacts.push({ contact: match, handles, identities });
          }
        }
      }

      // Only return sets where we successfully fetched 2+ valid contacts OR have similar name matches
      if (contacts.length > 1 || similarContacts.length > 0) {
        // Sort contacts by _creationTime asc (oldest first)
        contacts.sort(
          (a, b) => a.contact._creationTime - b.contact._creationTime,
        );
        results.push({ contacts, similarContacts });
      }
    }

    return {
      results,
      totalSets,
      hasMore: offset + limit < totalSets,
    };
  },
});

export const executeMerge = mutation({
  args: {
    primaryContactId: v.id("contacts"),
    duplicateContactIds: v.array(v.id("contacts")),
  },
  handler: async (ctx, args) => {
    const primary = await ctx.db.get(args.primaryContactId);
    if (!primary) throw new Error("Primary contact not found");

    // Pre-load Primary Data Sets to ensure perfect exact de-duplication
    const primaryIdentities = await ctx.db
      .query("contactIdentities")
      .withIndex("by_contactId", (q) => q.eq("contactId", primary._id))
      .collect();
    const primaryHandles = await ctx.db
      .query("contactHandles")
      .withIndex("by_contactId", (q) => q.eq("contactId", primary._id))
      .collect();

    const seenMatrixIds = new Set(primaryIdentities.map((i) => i.matrixId));
    const seenHandles = new Set(
      primaryHandles.map((h) => `${h.type}:${h.value}`),
    );

    for (const dupId of args.duplicateContactIds) {
      if (dupId === primary._id) continue;
      const dup = await ctx.db.get(dupId);
      if (!dup) continue;

      // 1. Move Identities
      const identities = await ctx.db
        .query("contactIdentities")
        .withIndex("by_contactId", (q) => q.eq("contactId", dupId))
        .collect();
      for (const iden of identities) {
        if (seenMatrixIds.has(iden.matrixId)) {
          await ctx.db.delete(iden._id);
        } else {
          await ctx.db.patch(iden._id, { contactId: primary._id });
          seenMatrixIds.add(iden.matrixId);
        }
      }

      // 2. Move Handles
      const dupHandles = await ctx.db
        .query("contactHandles")
        .withIndex("by_contactId", (q) => q.eq("contactId", dupId))
        .collect();
      for (const h of dupHandles) {
        const key = `${h.type}:${h.value}`;
        if (seenHandles.has(key)) {
          await ctx.db.delete(h._id);
        } else {
          await ctx.db.patch(h._id, { contactId: primary._id });
          seenHandles.add(key);
        }
      }

      // 3. Move Suggestions
      const suggestions = await ctx.db
        .query("contactSuggestions")
        .withIndex("by_contactId", (q) => q.eq("contactId", dupId))
        .collect();
      for (const s of suggestions) {
        // Simple distinct field-value check
        const existing = await ctx.db
          .query("contactSuggestions")
          .withIndex("by_contactId_field", (q) =>
            q.eq("contactId", primary._id).eq("field", s.field),
          )
          .filter((q) => q.eq(q.field("value"), s.value))
          .first();

        if (existing) {
          await ctx.db.delete(s._id);
        } else {
          await ctx.db.patch(s._id, { contactId: primary._id });
        }
      }

      // 4. Merge Metadata
      const patch: Partial<Doc<"contacts">> = {};

      if (!primary.name && dup.name) patch.name = dup.name;
      if (!primary.nickname && dup.nickname) patch.nickname = dup.nickname;
      if (!primary.company && dup.company) patch.company = dup.company;
      if (!primary.jobTitle && dup.jobTitle) patch.jobTitle = dup.jobTitle;
      if (!primary.birthday && dup.birthday) patch.birthday = dup.birthday;
      if (!primary.notes && dup.notes) patch.notes = dup.notes;
      if (!primary.avatarUrl && dup.avatarUrl) patch.avatarUrl = dup.avatarUrl;

      // Merge arrays uniquely
      if (dup.otherNames && dup.otherNames.length > 0) {
        const combined = new Set(primary.otherNames ?? []);
        for (const n of dup.otherNames) combined.add(n);
        patch.otherNames = Array.from(combined);
      }

      if (dup.name && dup.name !== primary.name && dup.name !== patch.name) {
        const combined = new Set(patch.otherNames ?? primary.otherNames ?? []);
        combined.add(dup.name);
        patch.otherNames = Array.from(combined);
      }

      if (dup.roles && dup.roles.length > 0) {
        const combined = new Set(primary.roles ?? []);
        for (const r of dup.roles) combined.add(r);
        patch.roles = Array.from(combined);
      }

      if (dup.addresses && dup.addresses.length > 0) {
        const combined = new Set(primary.addresses ?? []);
        for (const a of dup.addresses) combined.add(a);
        patch.addresses = Array.from(combined);
      }

      if (Object.keys(patch).length > 0) {
        patch.lastUpdateAt = Date.now();
        await ctx.db.patch(primary._id, patch);
        Object.assign(primary, patch); // Update in-memory for next dup loop
      }

      // 5. Cleanup Duplicate Contact
      await ctx.db.delete(dupId);

      // Audit Log
      await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
        action: "contact.merge",
        source: "user",
        entity: "contacts",
        entityId: primary._id,
        details: JSON.stringify({ mergedFrom: dupId, dupName: dup.name }),
        timestamp: Date.now(),
      });
    }
  },
});
