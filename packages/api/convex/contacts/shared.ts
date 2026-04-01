import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

export const phoneNumberValidator = v.object({
  label: v.optional(v.string()),
  value: v.string(),
});

export const emailValidator = v.object({
  label: v.optional(v.string()),
  value: v.string(),
});

export const contactFields = {
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

export const CONTACT_FIELD_KEYS = Object.keys(contactFields) as Array<
  keyof typeof contactFields
>;

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
  roles?: string[];
}

export type ContactHandle = {
  _id: string;
  type: "phone" | "email" | "facebook" | "instagram" | "telegram";
  value: string;
  label?: string;
};

export async function syncContactHandles(
  ctx: any,
  contactId: Id<"contacts">,
  phoneNumbers?: { label?: string; value: string }[],
  emails?: { label?: string; value: string }[],
) {
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

  if (phoneNumbers !== undefined) {
    for (const phone of phoneNumbers) {
      let formattedPhone = phone.value.replace(/[^\d+]/g, "");
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
