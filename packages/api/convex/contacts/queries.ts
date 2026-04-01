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
    const contacts = await ctx.db.query("contacts").collect();

    const enrichedContacts = await Promise.all(
      contacts.map(async (c: any) => {
        const withH = await withHandles(ctx, c);
        const suggestions = await ctx.db
          .query("contactSuggestions")
          .withIndex("by_contactId", (q: any) => q.eq("contactId", c._id))
          .collect();
        const earliestSuggestionAt =
          suggestions.length > 0
            ? Math.min(...suggestions.map((s: any) => s._creationTime))
            : undefined;
        return {
          ...withH,
          suggestions: suggestions.map((s: any) => ({
            _id: s._id as string,
            field: s.field as string,
            value: s.value as string,
          })),
          earliestSuggestionAt,
        };
      }),
    );

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
