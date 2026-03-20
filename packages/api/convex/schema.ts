import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  aiProviders: defineTable({
    provider: v.string(), // "openai", "anthropic", "ollama", etc.
    name: v.optional(v.string()), // User-friendly label, e.g. "Work OpenAI", "Personal GPT"
    model: v.optional(v.string()), // "gpt-4o", "claude-3.5-sonnet", etc.
    apiKey: v.optional(v.string()), // Optional for local models
    isDefault: v.boolean(),
  }).index("by_isDefault", ["isDefault"]),
  settings: defineTable({
    key: v.string(),
    value: v.any(), // JSON config values
  }).index("by_key", ["key"]),
  contacts: defineTable({
    name: v.optional(v.string()),
    nickname: v.optional(v.string()),
    roles: v.optional(v.array(v.id("roles"))),
    avatarUrl: v.optional(v.string()),
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
  }),
  contactIdentities: defineTable({
    contactId: v.id("contacts"),
    matrixId: v.string(),
    platform: v.optional(v.string()),
  })
    .index("by_matrixId", ["matrixId"])
    .index("by_contactId", ["contactId"]),
  conversations: defineTable({
    matrixRoomId: v.string(), // Matrix room ID
    name: v.optional(v.string()), // Group or DM name
    memberCount: v.number(), // Total members; > 2 means group
    participants: v.array(v.string()), // Matrix user IDs of participants
    topic: v.optional(v.string()), // Group topic/description
    channelId: v.id("channels"), // Originating channel (WhatsApp, Telegram, etc.)
    avatarUrl: v.optional(v.string()),
    lastMessageId: v.optional(v.id("messages")), // Useful for sorting listing
    updatedAt: v.number(),

    // Read & typing state
    unreadCount: v.optional(v.number()), // Unread message count
    lastReadEventId: v.optional(v.string()), // Last read Matrix event ID
    typingUsers: v.optional(v.array(v.string())), // Matrix IDs currently typing

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
    .index("by_updatedAt", ["updatedAt"])
    .index("by_channelId", ["channelId"]),
  messages: defineTable({
    conversationId: v.id("conversations"),
    eventId: v.string(), // Matrix event ID to prevent dupes
    sender: v.string(), // Matrix ID of sender
    text: v.string(),
    direction: v.union(v.literal("in"), v.literal("out")),
    timestamp: v.number(),

    // Message type (text, image, video, audio, file, sticker, location, reaction, notice)
    type: v.optional(
      v.union(
        v.literal("text"),
        v.literal("image"),
        v.literal("video"),
        v.literal("audio"),
        v.literal("file"),
        v.literal("sticker"),
        v.literal("location"),
        v.literal("reaction"),
        v.literal("notice"),
      ),
    ),

    // Soft-delete (redaction)
    isRedacted: v.optional(v.boolean()),

    // Reply threading
    replyToEventId: v.optional(v.string()),

    // Media attachment metadata
    attachmentUrl: v.optional(v.string()), // mxc:// URL
    attachmentMimeType: v.optional(v.string()),
    attachmentFileName: v.optional(v.string()),
    attachmentSize: v.optional(v.number()), // bytes

    // Reactions
    reactions: v.optional(
      v.array(
        v.object({
          key: v.string(), // Emoji or shortcode
          senders: v.array(v.string()), // Matrix IDs who reacted
        }),
      ),
    ),

    // Edit tracking
    editedAt: v.optional(v.number()),
  })
    .index("by_conversationId_timestamp", ["conversationId", "timestamp"])
    .index("by_eventId", ["eventId"]),
  artifacts: defineTable({
    value: v.string(), // The actual memory value
    description: v.string(), // Textual description for semantic search
    embedding: v.optional(v.array(v.float64())), // Vector for [description, value]
    accessibleToRoles: v.array(v.id("roles")), // Roles allowed to access it
    expiresAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).vectorIndex("by_embedding", {
    vectorField: "embedding",
    dimensions: 1536, // default OpenAI text-embedding-3-small dims
  }),
  channels: defineTable({
    type: v.union(v.literal("whatsapp"), v.literal("telegram")),
    label: v.string(), // User-friendly name, e.g. "My WhatsApp"
    status: v.union(
      v.literal("disconnected"),
      v.literal("pairing"),
      v.literal("connected"),
      v.literal("error"),
    ),
    qrCode: v.optional(v.string()), // QR code data string during pairing
    phoneNumber: v.optional(v.string()), // Connected phone number
    error: v.optional(v.string()), // Error message if status is "error"
    connectedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_type", ["type"]),
  roles: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()), // e.g. tailwind class "bg-red-100 text-red-700"
  }).index("by_name", ["name"]),
  auditLogs: defineTable({
    action: v.string(), // e.g. "contact.create", "conversation.toggleAI"
    source: v.union(v.literal("auto"), v.literal("manual")),
    entity: v.optional(v.string()), // Table name: "contacts", "conversations", etc.
    entityId: v.optional(v.string()), // Convex document ID of affected record
    details: v.optional(v.string()), // JSON-stringified summary of what changed
    timestamp: v.number(),
  })
    .index("by_timestamp", ["timestamp"])
    .index("by_entity", ["entity", "timestamp"])
    .index("by_action", ["action", "timestamp"]),
});
