import { mutation } from "./_generated/server";
import config from "./config.json";
import seedRoles from "./roles.json";

export const seedData = mutation({
  args: {},
  handler: async (ctx) => {
    let initializedKeys = 0;

    // Seed all key-value pairs from config.json into the config table
    for (const [key, value] of Object.entries(config)) {
      const existingConfig = await ctx.db
        .query("config")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first();

      if (!existingConfig) {
        await ctx.db.insert("config", {
          key,
          value: String(value),
        });
        initializedKeys++;
      }
    }

    // Seed default roles from roles.json
    let initializedRoles = 0;

    for (const role of seedRoles) {
      const existing = await ctx.db
        .query("roles")
        .withIndex("by_name", (q) => q.eq("name", role.name))
        .unique();

      if (!existing) {
        await ctx.db.insert("roles", {
          name: role.name,
          description: role.description,
        });
        initializedRoles++;
      }
    }

    // Ensure a self-contact exists (the user's own identity record)
    let selfCreated = false;
    const existingSelf = await ctx.db
      .query("contacts")
      .withIndex("by_isSelf", (q) => q.eq("isSelf", true))
      .first();

    if (!existingSelf) {
      await ctx.db.insert("contacts", {
        name: "Me",
        isSelf: true,
        lastUpdateAt: Date.now(),
      });
      selfCreated = true;
    }

    return `Seeding complete. Added ${initializedKeys} config entries, ${initializedRoles} roles.${selfCreated ? " Created self-contact." : ""}`;
  },
});
