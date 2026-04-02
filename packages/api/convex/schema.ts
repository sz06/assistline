import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ── Per-channel data schemas (discriminated union) ────────────────────────────
// Each bridge type gets its own typed schema. Exported so mutations/actions
// can reference the validators without duplicating definitions.

export const whatsAppChannelData = v.object({
  type: v.literal("whatsapp"),
  phoneNumber: v.optional(v.string()), // Connected phone number
  pairingCode: v.optional(v.string()), // Pairing code shown to user during connection
});

export const metaChannelData = v.object({
  type: v.union(v.literal("facebook"), v.literal("instagram")),
  loginId: v.optional(v.string()), // Provisioning API login_id
  accessToken: v.optional(v.string()), // Matrix access token for cookie delivery
  instructions: v.optional(v.string()), // Cookie entry prompt text shown to user during pairing
});

export const telegramChannelData = v.object({
  type: v.literal("telegram"),
  // Future Telegram-specific fields go here
});

export const channelDataValidator = v.union(
  whatsAppChannelData,
  metaChannelData,
  telegramChannelData,
);

export default defineSchema({
  aiProviders: defineTable({
    provider: v.string(), // "openai", "anthropic", "ollama", etc.
    type: v.union(v.literal("language"), v.literal("embedding")),
    name: v.optional(v.string()), // User-friendly label, e.g. "Work OpenAI", "Personal GPT"
    model: v.optional(v.string()), // "gpt-4o", "claude-3.5-sonnet", etc.
    apiKey: v.optional(v.string()), // Optional for local models
    baseUrl: v.optional(v.string()), // Custom endpoint URL (e.g. Ollama, CLIProxyAPI)
    isDefault: v.boolean(),
    aiTokensIn: v.optional(v.number()), // Cumulative LLM input tokens
    aiTokensOut: v.optional(v.number()), // Cumulative LLM output tokens
  })
    .index("by_isDefault", ["isDefault"])
    .index("by_type", ["type"]),
  config: defineTable({
    key: v.string(),
    value: v.string(),
  }).index("by_key", ["key"]),
  contacts: defineTable({
    name: v.optional(v.string()),
    nickname: v.optional(v.string()),
    otherNames: v.optional(v.array(v.string())),
    roles: v.optional(v.array(v.id("roles"))),
    avatarUrl: v.optional(v.string()),
    company: v.optional(v.string()),
    jobTitle: v.optional(v.string()),
    birthday: v.optional(v.string()),
    notes: v.optional(v.string()),
    addresses: v.optional(v.array(v.string())),
    isSelf: v.optional(v.boolean()), // True for the user's own contact record
    lastUpdateAt: v.optional(v.number()), // Timestamp of last modification
  })
    .index("by_isSelf", ["isSelf"])
    .index("by_name", ["name"]),
  contactIdentities: defineTable({
    contactId: v.id("contacts"),
    matrixId: v.string(),
    platform: v.optional(v.string()),
  })
    .index("by_matrixId", ["matrixId"])
    .index("by_contactId", ["contactId"]),
  contactHandles: defineTable({
    contactId: v.id("contacts"),
    type: v.union(
      v.literal("phone"),
      v.literal("email"),
      v.literal("facebook"),
      v.literal("instagram"),
      v.literal("telegram"),
    ),
    value: v.string(), // Normalized (lowercase email, strict E.164 phone)
    label: v.optional(v.string()), // e.g., "Work", "Personal"
  })
    .index("by_value", ["value"])
    .index("by_type_and_value", ["type", "value"])
    .index("by_contactId", ["contactId"]),
  conversations: defineTable({
    matrixRoomId: v.string(), // Matrix room ID for this conversation
    name: v.optional(v.string()), // Group or DM name
    memberCount: v.number(), // Total members; > 2 means group
    participants: v.array(v.string()), // Matrix IDs of all participants (user and contacts)
    topic: v.optional(v.string()), // Group topic/description
    channelId: v.id("channels"), // Channel this conversation was received through
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
    autoSend: v.optional(v.boolean()), // Defaults to false; when true, auto-sends replies
    agentThreadId: v.optional(v.string()), // Links to the Convex Agent component thread
    suggestedReply: v.optional(v.string()), // Pending draft reply
    aiTokensIn: v.optional(v.number()), // Cumulative LLM input tokens
    aiTokensOut: v.optional(v.number()), // Cumulative LLM output tokens
    lastAgentSyncTimestamp: v.optional(v.number()), // Timestamp of last message synced into agent thread
    lastSnapshotHash: v.optional(v.string()), // Hash of the last enriched snapshot — used for idempotency
  })
    .index("by_matrixRoomId", ["matrixRoomId"])
    .index("by_updatedAt", ["updatedAt"])
    .index("by_channelId", ["channelId"]),
  messages: defineTable({
    conversationId: v.id("conversations"),
    eventId: v.string(), // Matrix event ID to prevent dupes
    sender: v.string(), // Matrix ID of sender
    text: v.string(),
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
    editHistory: v.optional(
      v.array(
        v.object({
          text: v.string(),
          editedAt: v.number(),
        }),
      ),
    ),
  })
    .index("by_conversationId_timestamp", ["conversationId", "timestamp"])
    .index("by_eventId", ["eventId"]),
  artifacts: defineTable({
    value: v.string(), // The artifact content (self-descriptive fact, e.g. "User's home address: 123 Main St")
    embedding: v.optional(v.array(v.float64())), // Embedding vector for semantic search
    accessibleToRoles: v.array(v.id("roles")), // Roles allowed to access it
    expiresAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536, // default OpenAI text-embedding-3-small dims
    })
    .searchIndex("search_value", {
      searchField: "value",
    }),
  channels: defineTable({
    type: v.union(
      v.literal("whatsapp"),
      v.literal("telegram"),
      v.literal("facebook"),
      v.literal("instagram"),
    ),
    label: v.string(), // User-friendly name, e.g. "My WhatsApp"
    status: v.union(
      v.literal("disconnected"),
      v.literal("pairing"),
      v.literal("connected"),
      v.literal("error"),
    ),
    error: v.optional(v.string()), // Error message if status is "error"
    connectedAt: v.optional(v.number()),
    updatedAt: v.number(),
    selfPuppetId: v.optional(v.string()), // Matrix user ID of the user's own bridge puppet
    // Platform-specific pairing/session data — discriminated by channelData.type
    channelData: v.optional(channelDataValidator),
  }).index("by_type", ["type"]),
  roles: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
  }).index("by_name", ["name"]),
  auditLogs: defineTable({
    action: v.string(), // e.g. "contact.create", "conversation.toggleAI"
    source: v.union(v.literal("user"), v.literal("agent"), v.literal("system")),
    entity: v.optional(v.string()), // Table name: "contacts", "conversations", etc.
    entityId: v.optional(v.string()), // Convex document ID of affected record
    details: v.optional(v.string()), // JSON-stringified summary of what changed
    timestamp: v.number(),
  })
    .index("by_timestamp", ["timestamp"])
    .index("by_entity", ["entity", "timestamp"])
    .index("by_action", ["action", "timestamp"]),

  chatSessions: defineTable({
    title: v.optional(v.string()), // User-set or auto-generated title
    threadId: v.string(), // @convex-dev/agent thread ID
    updatedAt: v.number(),
    aiTokensIn: v.optional(v.number()), // Cumulative LLM input tokens
    aiTokensOut: v.optional(v.number()), // Cumulative LLM output tokens
  })
    .index("by_updatedAt", ["updatedAt"])
    .searchIndex("search_title", { searchField: "title" }),

  artifactSuggestions: defineTable({
    sessionId: v.optional(v.id("chatSessions")),
    conversationId: v.optional(v.id("conversations")),
    type: v.union(v.literal("create"), v.literal("update")),
    value: v.string(), // the proposed new value
    artifactId: v.optional(v.id("artifacts")), // only for update
    embedding: v.optional(v.array(v.float64())), // Embedding vector for semantic search
    accessibleToRoles: v.optional(v.array(v.id("roles"))),
    expiresAt: v.optional(v.number()),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_conversationId", ["conversationId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["sessionId", "conversationId", "type"],
    }),

  contactSuggestions: defineTable({
    contactId: v.id("contacts"),
    // One row per suggested field change, e.g. field="jobTitle", value="Engineer".
    // Arrays (e.g. roles) are JSON-serialized in value.
    field: v.string(),
    value: v.string(),
  })
    .index("by_contactId", ["contactId"])
    .index("by_contactId_field", ["contactId", "field"]),
});
