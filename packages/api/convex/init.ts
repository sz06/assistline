import { mutation } from "./_generated/server";
import config from "./config.json";

export const seedConfig = mutation({
  args: {},
  handler: async (ctx) => {
    let initializedKeys = 0;

    // Seed all key-value pairs from config.json into the settings table
    for (const [key, value] of Object.entries(config)) {
      const existingConfig = await ctx.db
        .query("settings")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first();

      if (!existingConfig) {
        await ctx.db.insert("settings", {
          key,
          value,
        });
        initializedKeys++;
      }
    }

    return `Config seeding complete. Added ${initializedKeys} new settings.`;
  },
});
