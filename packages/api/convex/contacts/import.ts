import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { syncContactHandles } from "./shared";

const incomingHandleValidator = v.object({
  type: v.union(v.literal("phone"), v.literal("email")),
  value: v.string(),
  label: v.optional(v.string()),
});

export const executeImportBatch = mutation({
  args: {
    contacts: v.array(
      v.object({
        sourceId: v.string(),
        name: v.optional(v.string()),
        company: v.optional(v.string()),
        jobTitle: v.optional(v.string()),
        notes: v.optional(v.string()),
        handles: v.array(incomingHandleValidator),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let createdCount = 0;

    for (const data of args.contacts) {
      const phoneNumbers = data.handles
        .filter((h) => h.type === "phone")
        .map((h) => ({ label: h.label, value: h.value }));
      const emails = data.handles
        .filter((h) => h.type === "email")
        .map((h) => ({ label: h.label, value: h.value }));

      const newId = await ctx.db.insert("contacts", {
        name: data.name,
        company: data.company,
        jobTitle: data.jobTitle,
        notes: data.notes,
        lastUpdateAt: Date.now(),
      });

      // Inject the new handles
      await syncContactHandles(ctx, newId, phoneNumbers, emails);
      createdCount++;
    }

    return { createdCount, mergedCount: 0 };
  },
});
