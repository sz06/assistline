import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalQuery, mutation, query } from "./_generated/server";

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

const contactFields = {
  name: v.optional(v.string()),
  nickname: v.optional(v.string()),
  otherNames: v.optional(v.array(v.string())),
  company: v.optional(v.string()),
  jobTitle: v.optional(v.string()),
  birthday: v.optional(v.string()),
  notes: v.optional(v.string()),
  addresses: v.optional(v.array(v.string())),
  roles: v.optional(v.array(v.id("roles"))),
};

/**
 * Canonical list of allowed contact field keys.
 * Single source of truth — used by the DA's tools and prompt.
 */
export const CONTACT_FIELD_KEYS = Object.keys(contactFields) as Array<
  keyof typeof contactFields
>;

/**
 * Shape of a resolved contact profile as returned by `getContactProfileQuery`.
 * Single source of truth — imported by helpers, tools, and tests.
 */
export interface ProfileShape {
  _id?: string;
  name?: string;
  nickname?: string;
  otherNames?: string[];
  phoneNumbers?: { label?: string; value: string }[];
  emails?: { label?: string; value: string }[];
  company?: string;
  jobTitle?: string;
  birthday?: string;
  notes?: string;
  addresses?: string[];
  roles?: string[]; // resolved role names
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function syncContactHandles(
  ctx: any,
  contactId: Id<"contacts">,
  phoneNumbers?: { label?: string; value: string }[],
  emails?: { label?: string; value: string }[],
) {
  // Clear existing handles
  const existingHandles = await ctx.db
    .query("contactHandles")
    .withIndex("by_contactId", (q: any) => q.eq("contactId", contactId))
    .collect();

  for (const handle of existingHandles) {
    if (handle.type === "phone" && phoneNumbers !== undefined) {
      await ctx.db.delete(handle._id);
    }
    if (handle.type === "email" && emails !== undefined) {
      await ctx.db.delete(handle._id);
    }
  }

  // Insert new ones
  if (phoneNumbers !== undefined) {
    for (const phone of phoneNumbers) {
      let formattedPhone = phone.value.replace(/[\s\-()]/g, "");
      if (/^\d+$/.test(formattedPhone)) {
        formattedPhone = `+${formattedPhone}`;
      }
      await ctx.db.insert("contactHandles", {
        contactId,
        type: "phone",
        value: formattedPhone,
        label: phone.label,
      });
    }
  }

  if (emails !== undefined) {
    for (const email of emails) {
      await ctx.db.insert("contactHandles", {
        contactId,
        type: "email",
        value: email.value.toLowerCase().trim(),
        label: email.label,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export type ContactHandle = {
  _id: string;
  type: "phone" | "email" | "facebook" | "instagram" | "telegram";
  value: string;
  label?: string;
};

async function withHandles(ctx: any, contact: any) {
  if (!contact) return null;
  const handles = await ctx.db
    .query("contactHandles")
    .withIndex("by_contactId", (q: any) => q.eq("contactId", contact._id))
    .collect();
  return { ...contact, handles };
}

/**
 * List all contacts, sorted in three tiers:
 * 1. Contacts with a user-set `name` (alphabetically)
 * 2. Contacts with `otherNames` but no `name` (alphabetically by first otherName)
 * 3. Everything else (by creation time)
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const contacts = await ctx.db.query("contacts").collect();

    // Attach handles and suggestion metadata
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

      // Within the same tier, sort alphabetically (or by creation time for tier 2)
      if (aTier === 2) return a._creationTime - b._creationTime;
      const nameA = (a.name ?? a.otherNames?.[0] ?? "").trim().toLowerCase();
      const nameB = (b.name ?? b.otherNames?.[0] ?? "").trim().toLowerCase();
      return nameA.localeCompare(nameB);
    });
  },
});

/** Get a single contact by ID. */
export const get = query({
  args: { id: v.id("contacts") },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.id);
    return withHandles(ctx, contact);
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
    phoneNumbers: v.optional(v.array(phoneNumberValidator)),
    emails: v.optional(v.array(emailValidator)),
    source: v.optional(
      v.union(v.literal("user"), v.literal("agent"), v.literal("system")),
    ),
  },
  handler: async (ctx, args) => {
    const { source, phoneNumbers, emails, ...fields } = args;
    const id = await ctx.db.insert("contacts", {
      ...fields,
      lastUpdateAt: Date.now(),
    });

    await syncContactHandles(ctx, id, phoneNumbers, emails);

    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "contact.create",
      source: source ?? "user",
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
    phoneNumbers: v.optional(v.array(phoneNumberValidator)),
    emails: v.optional(v.array(emailValidator)),
    source: v.optional(
      v.union(v.literal("user"), v.literal("agent"), v.literal("system")),
    ),
  },
  handler: async (ctx, args) => {
    const { id, source, phoneNumbers, emails, ...fields } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Contact not found");

    await ctx.db.patch(id, { ...fields, lastUpdateAt: Date.now() });

    await syncContactHandles(ctx, id, phoneNumbers, emails);

    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "contact.update",
      source: source ?? "user",
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
    source: v.optional(
      v.union(v.literal("user"), v.literal("agent"), v.literal("system")),
    ),
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

    // Cascade-delete handles
    const handles = await ctx.db
      .query("contactHandles")
      .withIndex("by_contactId", (q) => q.eq("contactId", args.id))
      .collect();
    for (const h of handles) {
      await ctx.db.delete(h._id);
    }

    await ctx.db.delete(args.id);
    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "contact.delete",
      source: args.source ?? "user",
      entity: "contacts",
      entityId: args.id,
      details: JSON.stringify({ name: existing?.name }),
      timestamp: Date.now(),
    });
  },
});

// ---------------------------------------------------------------------------
// Internal queries for Chatter agent tools
// ---------------------------------------------------------------------------

/** Look up a contact's full profile by their Convex document ID. */
export const getContactProfileQuery = internalQuery({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    const contact = await ctx.db.get(contactId);
    if (!contact) return null;

    const roleNames: string[] = [];
    if (contact.roles) {
      for (const roleId of contact.roles) {
        const role = await ctx.db.get(roleId);
        if (role) roleNames.push(role.name);
      }
    }

    const handles = await ctx.db
      .query("contactHandles")
      .withIndex("by_contactId", (q) => q.eq("contactId", contactId))
      .collect();

    const phoneNumbers = handles
      .filter((h) => h.type === "phone")
      .map((h) => ({ label: h.label, value: h.value }));
    const emails = handles
      .filter((h) => h.type === "email")
      .map((h) => ({ label: h.label, value: h.value }));

    return {
      _id: contact._id,
      name: contact.name,
      nickname: contact.nickname,
      otherNames: contact.otherNames,
      phoneNumbers,
      emails,
      company: contact.company,
      jobTitle: contact.jobTitle,
      birthday: contact.birthday,
      notes: contact.notes,
      addresses: contact.addresses,
      roles: roleNames,
    };
  },
});

/**
 * Resolve an array of Matrix IDs to their corresponding contact IDs.
 * Returns a record of matrixId → contactId (as string).
 * Unknown senders are omitted from the result.
 */
export const resolveContactIds = internalQuery({
  args: { matrixIds: v.array(v.string()) },
  handler: async (ctx, { matrixIds }) => {
    const result: Record<string, string> = {};
    for (const matrixId of matrixIds) {
      if (result[matrixId]) continue;
      const identity = await ctx.db
        .query("contactIdentities")
        .withIndex("by_matrixId", (q) => q.eq("matrixId", matrixId))
        .first();
      if (identity) {
        result[matrixId] = String(identity.contactId);
      }
    }
    return result;
  },
});
