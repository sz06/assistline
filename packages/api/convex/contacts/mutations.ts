import { v } from "convex/values";
import { internal } from "../_generated/api";
import { mutation } from "../_generated/server";
import {
  contactFields,
  emailValidator,
  phoneNumberValidator,
  syncContactHandles,
} from "./shared";

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

export const remove = mutation({
  args: {
    id: v.id("contacts"),
    source: v.optional(
      v.union(v.literal("user"), v.literal("agent"), v.literal("system")),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    const identities = await ctx.db
      .query("contactIdentities")
      .withIndex("by_contactId", (q) => q.eq("contactId", args.id))
      .collect();
    for (const identity of identities) {
      await ctx.db.delete(identity._id);
    }

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
