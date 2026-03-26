import { v } from "convex/values";
import { internalQuery, query } from "../_generated/server";

/**
 * List pending contact suggestions for a given contact.
 */
export const list = query({
  args: {
    contactId: v.id("contacts"),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("contactSuggestions")
      .withIndex("by_contactId", (q) => q.eq("contactId", args.contactId))
      .collect();
  },
});

/**
 * Batch-fetch pending suggestions for multiple contacts.
 * Returns a Record<contactId, suggestion[]> for easy lookup.
 */
export const listByContactIds = internalQuery({
  args: {
    contactIds: v.array(v.id("contacts")),
  },
  handler: async (ctx, args) => {
    const result: Record<
      string,
      Array<{ _id: string; field: string; value: string }>
    > = {};
    for (const contactId of args.contactIds) {
      const suggestions = await ctx.db
        .query("contactSuggestions")
        .withIndex("by_contactId", (q) => q.eq("contactId", contactId))
        .collect();
      if (suggestions.length > 0) {
        result[contactId] = suggestions.map((s) => ({
          _id: s._id,
          field: s.field,
          value: s.value,
        }));
      }
    }
    return result;
  },
});
