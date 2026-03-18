import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  aiProviders: defineTable({
    provider: v.string(), // "openai", "anthropic", "ollama", etc.
    apiKey: v.optional(v.string()), // Optional for local models
    isDefault: v.boolean(),
  }).index("by_isDefault", ["isDefault"]),
  settings: defineTable({
    key: v.string(),
    value: v.any(), // JSON config values
  }).index("by_key", ["key"]),
  contacts: defineTable({
    matrixId: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    nickname: v.optional(v.string()),
    phoneNumbers: v.optional(
      v.array(
        v.object({
          label: v.optional(v.string()),
          value: v.string(),
        }),
      ),
    ),
    emails: v.optional(
      v.array(
        v.object({
          label: v.optional(v.string()),
          value: v.string(),
        }),
      ),
    ),
    company: v.optional(v.string()),
    jobTitle: v.optional(v.string()),
    birthday: v.optional(v.string()),
    notes: v.optional(v.string()),
    addresses: v.optional(
      v.array(
        v.object({
          label: v.optional(v.string()),
          street: v.optional(v.string()),
          city: v.optional(v.string()),
          state: v.optional(v.string()),
          postalCode: v.optional(v.string()),
          country: v.optional(v.string()),
        }),
      ),
    ),
    linkedMatrixIds: v.optional(v.array(v.string())),
  }).index("by_matrixId", ["matrixId"]),
  conversations: defineTable({
    matrixRoomId: v.string(), // Matrix room ID
    name: v.optional(v.string()), // Group or DM name
    isGroup: v.boolean(),
    avatarUrl: v.optional(v.string()),
    lastMessageId: v.optional(v.id("messages")), // Useful for sorting listing
    updatedAt: v.number(),

    // AI & Dashboard State (Inspired by Aileen)
    status: v.optional(
      v.union(
        v.literal("idle"),
        v.literal("needs_reply"),
        v.literal("waiting_on_contact"),
      ),
    ),
    aiEnabled: v.optional(v.boolean()), // Defaults to false per request
    suggestedReply: v.optional(v.string()), // Pending draft reply
    suggestedActions: v.optional(v.array(v.string())), // Pending JSON agent actions
    currentIntent: v.optional(v.string()), // AI categorized intent
  })
    .index("by_matrixRoomId", ["matrixRoomId"])
    .index("by_updatedAt", ["updatedAt"]),
  messages: defineTable({
    conversationId: v.id("conversations"),
    eventId: v.optional(v.string()), // Matrix event ID to prevent dupes
    sender: v.string(), // Matrix ID of sender
    text: v.string(),
    direction: v.union(v.literal("in"), v.literal("out")),
    timestamp: v.number(),
  })
    .index("by_conversationId_timestamp", ["conversationId", "timestamp"])
    .index("by_eventId", ["eventId"]),
  user_context: defineTable({
    fact: v.string(),
    embedding: v.array(v.float64()),
    sourceMessageId: v.optional(v.id("messages")),
    timestamp: v.number(),
  }).vectorIndex("by_embedding", {
    vectorField: "embedding",
    dimensions: 1536, // default OpenAI text-embedding-3-small dims
  }),
});
