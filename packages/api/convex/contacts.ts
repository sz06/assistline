import { v } from "convex/values";
import { internal } from "./_generated/api";
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
  args: {
    ...contactFields,
    source: v.optional(v.union(v.literal("auto"), v.literal("manual"))),
  },
  handler: async (ctx, args) => {
    const { source, ...fields } = args;
    const id = await ctx.db.insert("contacts", fields);
    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "contact.create",
      source: source ?? "manual",
      entity: "contacts",
      entityId: id,
      details: JSON.stringify({ name: args.name }),
      timestamp: Date.now(),
    });
    return id;
  },
});

/** Update an existing contact. */
export const update = mutation({
  args: {
    id: v.id("contacts"),
    ...contactFields,
    source: v.optional(v.union(v.literal("auto"), v.literal("manual"))),
  },
  handler: async (ctx, args) => {
    const { id, source, ...fields } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Contact not found");
    await ctx.db.patch(id, fields);
    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "contact.update",
      source: source ?? "manual",
      entity: "contacts",
      entityId: id,
      details: JSON.stringify({ name: fields.name }),
      timestamp: Date.now(),
    });
  },
});

/** Remove a contact and all associated contactIdentities. */
export const remove = mutation({
  args: {
    id: v.id("contacts"),
    source: v.optional(v.union(v.literal("auto"), v.literal("manual"))),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    // Cascade-delete linked identities
    const identities = await ctx.db
      .query("contactIdentities")
      .withIndex("by_contactId", (q) => q.eq("contactId", args.id))
      .collect();
    for (const identity of identities) {
      await ctx.db.delete(identity._id);
    }
    await ctx.db.delete(args.id);
    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "contact.delete",
      source: args.source ?? "manual",
      entity: "contacts",
      entityId: args.id,
      details: JSON.stringify({ name: existing?.name }),
      timestamp: Date.now(),
    });
  },
});
