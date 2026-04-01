import { v } from "convex/values";
import { internalQuery } from "../_generated/server";

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
