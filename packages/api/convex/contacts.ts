import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ---------------------------------------------------------------------------
// Shared validators
// ---------------------------------------------------------------------------

const phoneNumberValidator = v.object({
  label: v.optional(v.string()),
  value: v.string(),
});

const emailValidator = v.object({
  label: v.optional(v.string()),
  value: v.string(),
});

const addressValidator = v.object({
  label: v.optional(v.string()),
  street: v.optional(v.string()),
  city: v.optional(v.string()),
  state: v.optional(v.string()),
  postalCode: v.optional(v.string()),
  country: v.optional(v.string()),
});

const contactFields = {
  name: v.optional(v.string()),
  nickname: v.optional(v.string()),
  phoneNumbers: v.optional(v.array(phoneNumberValidator)),
  emails: v.optional(v.array(emailValidator)),
  company: v.optional(v.string()),
  jobTitle: v.optional(v.string()),
  birthday: v.optional(v.string()),
  notes: v.optional(v.string()),
  addresses: v.optional(v.array(addressValidator)),
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** List all contacts, sorted by first name then last name. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const contacts = await ctx.db.query("contacts").collect();
    return contacts.sort((a, b) => {
      const nameA = (a.name ?? "").trim().toLowerCase();
      const nameB = (b.name ?? "").trim().toLowerCase();
      return nameA.localeCompare(nameB);
    });
  },
});

/** Get a single contact by ID. */
export const get = query({
  args: { id: v.id("contacts") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.id);
  },
});

/** Get identities for a contact. */
export const getIdentities = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("contactIdentities")
      .withIndex("by_contactId", (q) => q.eq("contactId", args.contactId))
      .collect();
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Create a new contact. */
export const create = mutation({
  args: contactFields,
  handler: async (ctx, args) => {
    return ctx.db.insert("contacts", args);
  },
});

/** Update an existing contact. */
export const update = mutation({
  args: {
    id: v.id("contacts"),
    ...contactFields,
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Contact not found");
    await ctx.db.patch(id, fields);
  },
});

/** Remove a contact and all associated contactIdentities. */
export const remove = mutation({
  args: { id: v.id("contacts") },
  handler: async (ctx, args) => {
    // Cascade-delete linked identities
    const identities = await ctx.db
      .query("contactIdentities")
      .withIndex("by_contactId", (q) => q.eq("contactId", args.id))
      .collect();
    for (const identity of identities) {
      await ctx.db.delete(identity._id);
    }
    await ctx.db.delete(args.id);
  },
});
