import { v } from "convex/values";
import { query } from "../_generated/server";

export async function withHandles(ctx: any, contact: any) {
  if (!contact) return null;
  const handles = await ctx.db
    .query("contactHandles")
    .withIndex("by_contactId", (q: any) => q.eq("contactId", contact._id))
    .collect();
  return { ...contact, handles };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    // Execute exactly 3 read queries to prevent N+1 hitting Convex 4096 read limits
    const contacts = await ctx.db.query("contacts").collect();
    const allHandles = await ctx.db.query("contactHandles").collect();
    const allSuggestions = await ctx.db.query("contactSuggestions").collect();

    // Group Handles
    const handlesMap = new Map();
    for (const h of allHandles) {
      if (!handlesMap.has(h.contactId)) handlesMap.set(h.contactId, []);
      handlesMap.get(h.contactId).push(h);
    }

    // Group Suggestions
    const suggestionsMap = new Map();
    for (const s of allSuggestions) {
      if (!suggestionsMap.has(s.contactId)) suggestionsMap.set(s.contactId, []);
      suggestionsMap.get(s.contactId).push(s);
    }

    const enrichedContacts = contacts.map((c: any) => {
      const handles = handlesMap.get(c._id) || [];
      const suggestions = suggestionsMap.get(c._id) || [];

      const earliestSuggestionAt =
        suggestions.length > 0
          ? Math.min(...suggestions.map((s: any) => s._creationTime))
          : undefined;

      return {
        ...c,
        handles,
        suggestions: suggestions.map((s: any) => ({
          _id: s._id as string,
          field: s.field as string,
          value: s.value as string,
        })),
        earliestSuggestionAt,
      };
    });

    return enrichedContacts.sort((a, b) => {
      const aTier = a.name?.trim() ? 0 : a.otherNames?.length ? 1 : 2;
      const bTier = b.name?.trim() ? 0 : b.otherNames?.length ? 1 : 2;
      if (aTier !== bTier) return aTier - bTier;

      if (aTier === 2) return a._creationTime - b._creationTime;
      const nameA = (a.name ?? a.otherNames?.[0] ?? "").trim().toLowerCase();
      const nameB = (b.name ?? b.otherNames?.[0] ?? "").trim().toLowerCase();
      return nameA.localeCompare(nameB);
    });
  },
});

export const get = query({
  args: { id: v.id("contacts") },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.id);
    return withHandles(ctx, contact);
  },
});

export const getIdentities = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("contactIdentities")
      .withIndex("by_contactId", (q) => q.eq("contactId", args.contactId))
      .collect();
  },
});
