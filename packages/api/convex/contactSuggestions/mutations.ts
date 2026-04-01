import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, mutation } from "../_generated/server";
import { resolveRoleNamesToIds } from "../roles";

/**
 * Push a single-field contact suggestion.
 * Skips insertion if an identical (contactId + field) suggestion already exists.
 */
export const push = internalMutation({
  args: {
    contactId: v.id("contacts"),
    field: v.string(),
    value: v.string(),
  },
  handler: async (ctx, args) => {
    // Deduplication: skip if same field already has a pending suggestion
    const existing = await ctx.db
      .query("contactSuggestions")
      .withIndex("by_contactId_field", (q) =>
        q.eq("contactId", args.contactId).eq("field", args.field),
      )
      .first();

    if (existing) {
      console.log(
        `[ContactManager] Skipping duplicate suggestion for contact ${args.contactId} (field: ${args.field})`,
      );
      return;
    }

    const suggestionId = await ctx.db.insert("contactSuggestions", {
      contactId: args.contactId,
      field: args.field,
      value: args.value,
    });

    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "contact.suggestion.created",
      source: "agent",
      entity: "contactSuggestions",
      entityId: suggestionId as unknown as Id<"contactSuggestions">,
      details: JSON.stringify({
        contactId: args.contactId,
        field: args.field,
      }),
      timestamp: Date.now(),
    });
  },
});

/**
 * Dismiss a pending contact suggestion (user rejected it).
 */
export const dismiss = mutation({
  args: {
    suggestionId: v.id("contactSuggestions"),
  },
  handler: async (ctx, args) => {
    const suggestion = await ctx.db.get(args.suggestionId);
    if (!suggestion) return;

    await ctx.db.delete(args.suggestionId);

    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "contact.suggestion.dismissed",
      source: "user",
      entity: "contactSuggestions",
      entityId: args.suggestionId,
      details: JSON.stringify({
        contactId: suggestion.contactId,
        field: suggestion.field,
      }),
      timestamp: Date.now(),
    });
  },
});

/**
 * Execute (approve) a single-field suggestion, applying it to the contact.
 */
/**
 * Update the value of an existing pending suggestion.
 * Used by the Dispatcher agent to refine a suggestion it previously created.
 */
export const updateValue = internalMutation({
  args: {
    suggestionId: v.id("contactSuggestions"),
    value: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.suggestionId);
    if (!existing) {
      console.warn(
        `[ContactSuggestions] updateValue: suggestion ${args.suggestionId} not found — skipping.`,
      );
      return;
    }

    await ctx.db.patch(args.suggestionId, { value: args.value });

    await ctx.scheduler.runAfter(0, internal.auditLogs.log, {
      action: "contact.suggestion.updated",
      source: "agent",
      entity: "contactSuggestions",
      entityId: args.suggestionId,
      details: JSON.stringify({
        contactId: existing.contactId,
        field: existing.field,
        oldValue: existing.value,
        newValue: args.value,
      }),
      timestamp: Date.now(),
    });
  },
});

export const execute = mutation({
  args: {
    suggestionId: v.id("contactSuggestions"),
  },
  handler: async (ctx, args) => {
    const suggestion = await ctx.db.get(args.suggestionId);
    if (!suggestion) return;

    await ctx.db.delete(args.suggestionId);

    const { field } = suggestion;

    // Parse value — arrays are JSON-encoded, plain strings are raw
    let parsedValue: unknown;
    try {
      parsedValue = JSON.parse(suggestion.value);
    } catch {
      parsedValue = suggestion.value;
    }

    // Safety net: wrap plain-string values for array fields
    if (typeof parsedValue === "string") {
      if (field === "emails" || field === "phoneNumbers") {
        parsedValue = [{ value: parsedValue }];
      } else if (field === "addresses" || field === "otherNames") {
        parsedValue = [parsedValue];
      } else if (field === "roles") {
        parsedValue = parsedValue
          .split(",")
          .map((r) => r.trim())
          .filter(Boolean);
      }
    }

    // Resolve role names to role IDs
    if (field === "roles" && Array.isArray(parsedValue)) {
      parsedValue = await resolveRoleNamesToIds(ctx, parsedValue as string[]);
    }

    await ctx.runMutation(api.contacts.mutations.update, {
      id: suggestion.contactId,
      [field]: parsedValue,
    });
  },
});
