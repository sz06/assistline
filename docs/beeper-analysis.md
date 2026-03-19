# Beeper Source Code Analysis — What Assistline Can Borrow

> **Date:** March 18, 2026  
> **Source:** [github.com/beeper](https://github.com/beeper) (125 repos)  
> **Purpose:** Identify patterns, data models, and features from Beeper's open-source codebase that Assistline can adopt. Assistline shares Beeper's Matrix backbone but differentiates with an AI-powered conversation layer and a Convex-backed persistent memory system.

---

## Table of Contents

- [Architecture Comparison](#architecture-comparison)
- [Dual Storage Architecture](#dual-storage-architecture)
- [High-Value Features to Borrow](#high-value-features-to-borrow)
  - [1. Streaming AI Responses](#1-streaming-ai-responses-agentremote-pattern)
  - [2. Tool Approval System](#2-tool-approval-system)
  - [3. Desktop API Data Models](#3-desktop-api-data-models)
  - [4. Search Architecture](#4-search-architecture)
  - [5. Chat Archiving & Inbox Management](#5-chat-archiving--inbox-management)
  - [6. MCP Server Integration](#6-mcp-server-integration)
  - [7. Media Viewer Pattern](#7-media-viewer-pattern)
- [Medium-Value Patterns](#medium-value-patterns)
  - [8. Bridge Manager CLI](#8-bridge-manager-cli)
  - [9. Rageshake (Bug Reports)](#9-rageshake-bug-reports)
  - [10. Agent Identity & Capabilities](#10-agent-identity--capabilities)
- [Things NOT to Borrow](#things-not-to-borrow)
- [Priority Implementation Roadmap](#priority-implementation-roadmap)
- [Key Repos Reference](#key-repos-reference)

---

## Architecture Comparison

### Beeper's Stack

```
Beeper Desktop/Mobile Client
  ↕  Desktop API (REST, Stainless-generated TypeScript SDK)
  ↕  Synapse Homeserver (customized fork)
  ↕  mautrix/* Bridges (WhatsApp, Telegram, Signal, Discord, Slack, LinkedIn, etc.)
  ↕  AgentRemote (Go SDK — bridges AI agents into Matrix rooms)
  ↕  MCP Server (AI assistant access to chats)
```

### Assistline's Stack

```
Dashboard (Vite + React)
  ↕  Convex Backend (real-time, type-safe)
  ↕  Matrix Listener (Node.js, long-polling /sync)
  ↕  Dendrite Homeserver (lightweight)
  ↕  mautrix-whatsapp Bridge
  ↕  Vector Memory (user_context table with embeddings)
```

### Key Architectural Differences

| Aspect | Beeper | Assistline |
|---|---|---|
| **Homeserver** | Synapse (Python, customized fork) | Dendrite (Go, lightweight) |
| **Client data layer** | REST API + generated SDK | Convex real-time subscriptions |
| **AI integration** | AgentRemote — external bridge, stateless | Built-in with persistent memory |
| **Streaming** | Ephemeral Matrix events + timeline edits | Convex document patching (simpler) |
| **Bridge languages** | Go (primary), Python | TypeScript (Node.js listener) |
| **Memory** | None (stateless agents) | Vector search embeddings (`user_context`) |

---

## Dual Storage Architecture

> **Q: Do messages live in two places — the Matrix server and the app database?**
>
> **A: Yes, in both Beeper's architecture and ours. This is intentional and correct.**

### Beeper's Dual Storage

**1. Matrix Homeserver (Synapse) — the source of truth**
- All messages are Matrix events stored in Synapse's PostgreSQL database
- This is where encryption, federation, and the protocol-level message history live
- Bridges (mautrix-whatsapp, etc.) push messages *into* Synapse as Matrix events

**2. Beeper Desktop API layer — the read-optimized view**
- Their Desktop API (`desktop-api-js`) exposes a REST interface with its own data model (`Chat`, `Message`, `User`)
- This layer adds Beeper-specific metadata: `unreadCount`, `isArchived`, `isPinned`, `isMuted`, `sortKey`, resolved `senderName`, attachment previews, etc.
- It's backed by a separate PostgreSQL database ([`desktop-api-sql`](https://github.com/beeper/desktop-api-sql) confirms this)
- This is essentially a **materialized view** of Matrix data, enriched with app-specific state

**Beeper's message flow:**

```
WhatsApp → mautrix-whatsapp → Synapse (source of truth) → Desktop API DB (enriched view) → Client
```

### Assistline's Equivalent Pattern

We follow the exact same pattern:

```
WhatsApp → mautrix-whatsapp → Dendrite (source of truth) → Convex (enriched view) → Dashboard
```

The **Listener** (`apps/listener`) is the bridge between these two stores — it long-polls Dendrite's `/sync` endpoint and writes into Convex via `insertMessage`. Convex is our equivalent of Beeper's Desktop API database.

### Why Dual Storage Is Correct

| Concern | Why this pattern is right |
|---|---|
| **Query flexibility** | Dendrite stores Matrix events in a protocol-specific format. Convex gives us full-text search, vector search, custom indexes, real-time subscriptions — none of which Matrix `/sync` provides natively |
| **AI enrichment** | Our `suggestedReply`, `currentIntent`, `status`, `aiEnabled`, and the entire `user_context` vector table have no place in Matrix. They belong in the app layer |
| **Performance** | Matrix `/sync` is designed for incremental long-polling, not for "show me the 50 most recent conversations sorted by activity with contact details". Convex handles that in one query |
| **Source of truth** | Dendrite remains the source of truth for raw messages. If we ever lose Convex data, the Listener can re-sync from Dendrite. The reverse isn't true — Convex-only data (AI state, memory) lives only in Convex |

### Data Drift Risks

The one risk with dual storage is **data drift** — if a message gets deleted or edited in Matrix but the Listener doesn't catch it, Convex will be stale.

Beeper solves this by having their Desktop API layer listen to Matrix state changes (redactions, edits, read receipts). Our Listener currently only handles `m.room.message` events.

**Matrix event types to handle in the future (P2):**

| Event Type | Purpose | Impact |
|---|---|---|
| `m.room.redaction` | Message deletions | Remove message from Convex |
| `m.room.message` with `m.relates_to.rel_type: "m.replace"` | Message edits | Patch message text in Convex |
| `m.receipt` | Read receipts | Update `unreadCount` on conversations |
| `m.room.member` with `membership: "leave"` | User leaves room | Update conversation participant state |
| `m.typing` | Typing indicators | Ephemeral UX (no Convex storage needed) |

**Suggested Listener enhancement** (add to `handleTimelineEvent`):

```typescript
// Handle message redactions (deletions)
if (event.type === "m.room.redaction") {
  const redactedEventId = event.content.redacts;
  if (redactedEventId) {
    const existing = await convex.query(api.messages.getByEventId, {
      eventId: redactedEventId,
    });
    if (existing) {
      await convex.mutation(api.messages.deleteMessage, {
        messageId: existing._id,
      });
    }
  }
  return;
}

// Handle message edits
if (
  event.type === "m.room.message" &&
  event.content["m.relates_to"]?.rel_type === "m.replace"
) {
  const originalEventId = event.content["m.relates_to"].event_id;
  const newBody = event.content["m.new_content"]?.body;
  if (originalEventId && newBody) {
    const existing = await convex.query(api.messages.getByEventId, {
      eventId: originalEventId,
    });
    if (existing) {
      await convex.mutation(api.messages.editMessage, {
        messageId: existing._id,
        text: newBody,
      });
    }
  }
  return;
}
```

This is a P2 concern — what we have now works perfectly for the current stage, since WhatsApp messages are rarely edited or deleted via Matrix.

---

## High-Value Features to Borrow

### 1. Streaming AI Responses (AgentRemote Pattern)

**Source:** [`beeper/agentremote`](https://github.com/beeper/agentremote) — [Matrix AI Transport Spec v1](https://github.com/beeper/agentremote/blob/main/docs/matrix-ai-matrix-spec-v1.md)

Beeper defines a full real-time AI transport protocol over Matrix:

- Each AI response is a **turn** with a unique `turn_id`
- Streaming uses ephemeral `com.beeper.ai.stream_event` events with monotonic `seq` ordering
- A placeholder message is sent first, then replaced via `m.replace` with the final content
- Metadata tracks: `model`, `finish_reason`, token `usage`, and `timing`

**How Assistline should adapt:**

Since Convex has built-in real-time subscriptions, we don't need the complex ephemeral-event-with-timeline-edit-fallback pattern. Instead:

1. Insert a "thinking" message into Convex with `status: "streaming"`
2. Patch the message document as tokens arrive
3. Dashboard auto-updates via Convex subscription
4. Mark `status: "complete"` when done

**Suggested new schema table:**

```typescript
aiTurns: defineTable({
  conversationId: v.id("conversations"),
  messageId: v.id("messages"),           // The message being generated
  turnId: v.string(),                     // Unique turn identifier
  model: v.string(),                      // "gpt-4o", "claude-3.5-sonnet"
  status: v.union(
    v.literal("streaming"),
    v.literal("complete"),
    v.literal("error"),
    v.literal("aborted"),
  ),
  tokenUsage: v.optional(v.object({
    promptTokens: v.number(),
    completionTokens: v.number(),
    reasoningTokens: v.optional(v.number()),
  })),
  timing: v.optional(v.object({
    startedAt: v.number(),
    firstTokenAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })),
  finishReason: v.optional(v.string()),   // "stop", "length", "tool_use"
}).index("by_conversationId", ["conversationId"])
  .index("by_messageId", ["messageId"]),
```

**Beeper's stream chunk types (for reference):**

```
start, start-step, finish-step, message-metadata,
text-start, text-delta, text-end,
reasoning-start, reasoning-delta, reasoning-end,
tool-input-start, tool-input-delta, tool-input-available,
tool-approval-request, tool-approval-response,
tool-output-available, tool-output-error, tool-output-denied,
source-url, source-document, file,
finish, abort, error
```

---

### 2. Tool Approval System

**Source:** [`agentremote` — Tool Approvals](https://github.com/beeper/agentremote/blob/main/docs/matrix-ai-matrix-spec-v1.md)

Beeper's AI agents can request human approval for tool calls:

1. AI generates a tool call (e.g., "send email to John")
2. An approval notice appears in chat with reaction-based buttons
3. User reacts with an approval/denial key
4. Agent proceeds or aborts
5. TTL expires after 600s by default

Config options:
- `tool_approvals.enabled` (default: true)
- `tool_approvals.ttl_seconds` (default: 600)
- `tool_approvals.require_for_mcp` (default: true)
- `tool_approvals.require_for_tools` (configurable list)
- "Always allow" rules can be persisted per login/account

**Assistline adaptation:**

Currently, Assistline has `suggestedActions: string[]` on conversations — this is flat and untracked. The Beeper pattern is richer:

```typescript
toolApprovals: defineTable({
  conversationId: v.id("conversations"),
  turnId: v.string(),
  toolName: v.string(),         // "send_email", "schedule_appointment"
  toolArgs: v.string(),         // JSON serialized arguments
  status: v.union(
    v.literal("pending"),
    v.literal("approved"),
    v.literal("denied"),
    v.literal("expired"),
  ),
  ttlSeconds: v.number(),       // Default 600
  requestedAt: v.number(),
  resolvedAt: v.optional(v.number()),
  resolvedBy: v.optional(v.string()),
}).index("by_conversationId_status", ["conversationId", "status"]),
```

**Benefits over current `suggestedActions`:**
- Each action is independently tracked with audit trail
- Expiration support (auto-expire stale requests)
- Can show pending/resolved state in UI
- Ties back to specific AI turn for context

---

### 3. Desktop API Data Models

**Source:** [`beeper/desktop-api-js`](https://github.com/beeper/desktop-api-js) — [Full API Reference](https://github.com/beeper/desktop-api-js/blob/main/api.md)

Beeper's SDK (generated with [Stainless](https://www.stainless.com/)) has well-typed models for Chat, Message, User, and Attachment.

#### 3a. Message Model Gaps

| Beeper Field | Type | Assistline Status |
|---|---|---|
| `type` | `TEXT \| IMAGE \| VIDEO \| VOICE \| AUDIO \| FILE \| STICKER \| LOCATION \| REACTION` | ❌ Only plain text |
| `attachments[]` | `Array<{ type, id, mimeType, fileName, fileSize, srcURL, duration, size }>` | ❌ Not supported |
| `reactions[]` | `Array<{ id, participantID, reactionKey, emoji }>` | ❌ Not supported |
| `linkedMessageID` | `string` (reply-to threading) | ❌ Not supported |
| `isSender` | `boolean` | ✅ Covered by `direction` enum |
| `isUnread` | `boolean` | ❌ Not tracked |
| `sortKey` | `string` (deterministic ordering) | ⚠️ Using `timestamp` (can collide) |
| `senderName` | `string` (resolved display name) | ⚠️ Looked up at query time from contacts |

**Suggested messages schema enhancement:**

```typescript
messages: defineTable({
  conversationId: v.id("conversations"),
  eventId: v.optional(v.string()),
  sender: v.string(),
  text: v.string(),
  direction: v.union(v.literal("in"), v.literal("out")),
  timestamp: v.number(),
  // NEW FIELDS ↓
  messageType: v.optional(v.union(
    v.literal("text"),
    v.literal("image"),
    v.literal("video"),
    v.literal("voice"),
    v.literal("audio"),
    v.literal("file"),
    v.literal("sticker"),
    v.literal("location"),
  )),
  attachments: v.optional(v.array(v.object({
    type: v.union(v.literal("img"), v.literal("video"), v.literal("audio"), v.literal("unknown")),
    mxcUrl: v.string(),          // Matrix mxc:// URL
    mimeType: v.optional(v.string()),
    fileName: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    duration: v.optional(v.number()),   // seconds, for audio/video
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  }))),
  replyToMessageId: v.optional(v.id("messages")),
  isRead: v.optional(v.boolean()),
})
```

#### 3b. Chat (Conversation) Model Gaps

| Beeper Field | Type | Assistline Status |
|---|---|---|
| `unreadCount` | `number` | ❌ Not tracked |
| `isArchived` | `boolean` | ❌ Not supported |
| `isMuted` | `boolean` | ❌ Not supported |
| `isPinned` | `boolean` | ❌ Not supported |
| `participants` | `{ items: User[], total: number, hasMore: boolean }` | ❌ Only `isGroup` boolean |
| `lastActivity` | ISO timestamp | ✅ Covered by `updatedAt` |
| `reminders` | create/delete per chat | ❌ Not implemented |
| `type` | `single \| group` | ✅ Covered by `isGroup` |

**Suggested conversations schema enhancement:**

```typescript
conversations: defineTable({
  // ... existing fields ...
  // NEW FIELDS ↓
  isArchived: v.optional(v.boolean()),
  isPinned: v.optional(v.boolean()),
  isMuted: v.optional(v.boolean()),
  unreadCount: v.optional(v.number()),
  reminderAt: v.optional(v.number()),  // Unix timestamp for follow-up reminder
})
```

#### 3c. User Model (Beeper's `User` interface)

```typescript
// Beeper's User type — for reference
interface User {
  id: string;                    // Stable Beeper user ID
  fullName?: string;             // Display name
  username?: string;             // Handle (@alice)
  email?: string;                // Email if known
  phoneNumber?: string;          // E.164 format
  imgURL?: string;               // Avatar URL
  isSelf?: boolean;              // Is this the auth'd user?
  cannotMessage?: boolean;       // Blocked/unreachable?
}
```

Our `contacts` table already covers most of this. Consider adding `avatarUrl` to contacts.

#### 3d. Attachment Model (Beeper's `Attachment` interface)

```typescript
// Beeper's Attachment type — for reference
interface Attachment {
  type: 'unknown' | 'img' | 'video' | 'audio';
  id?: string;                   // mxc:// URL
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  duration?: number;             // seconds (audio/video)
  isGif?: boolean;
  isSticker?: boolean;
  isVoiceNote?: boolean;
  srcURL?: string;               // Public or local URL
  posterImg?: string;            // Video thumbnail
  size?: { width?: number; height?: number };
}
```

---

### 4. Search Architecture

**Source:** Desktop API SDK — `client.chats.search()` and `client.messages.search()`

Beeper's search supports:
- Full-text across messages with account filtering
- Chat search by title, participants, network
- Filter by inbox type (primary / low-priority / archive)
- Filter by muted, unread, date range
- Cursor-based pagination

**Current Assistline search:** Client-side `.filter()` on name and phone number only.

**Recommended implementation:**

```typescript
// Add search index to schema
messages: defineTable({ /* ... */ })
  .searchIndex("search_text", {
    searchField: "text",
    filterFields: ["conversationId"],
  }),

// New query
export const searchMessages = query({
  args: {
    query: v.string(),
    conversationId: v.optional(v.id("conversations")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("messages")
      .withSearchIndex("search_text", (q) => {
        let search = q.search("text", args.query);
        if (args.conversationId) {
          search = search.eq("conversationId", args.conversationId);
        }
        return search;
      })
      .take(args.limit ?? 20);
    return results;
  },
});
```

---

### 5. Chat Archiving & Inbox Management

Beeper has a three-tier inbox: **Primary / Low-Priority / Archive**, with mute and pin controls.

**Minimum viable version for Assistline (add to conversations schema):**

```typescript
isArchived: v.optional(v.boolean()),  // Move to archive without deleting
isPinned: v.optional(v.boolean()),    // Pin to top of list
isMuted: v.optional(v.boolean()),     // Suppress notifications
unreadCount: v.optional(v.number()),  // Badge count
```

**New mutations needed:**

```typescript
export const archiveConversation = mutation({
  args: { conversationId: v.id("conversations"), archived: v.boolean() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.conversationId, { isArchived: args.archived });
  },
});

export const pinConversation = mutation({
  args: { conversationId: v.id("conversations"), pinned: v.boolean() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.conversationId, { isPinned: args.pinned });
  },
});

export const markAsRead = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.conversationId, { unreadCount: 0 });
  },
});
```

---

### 6. MCP Server Integration

Beeper's Desktop API includes an MCP (Model Context Protocol) server, allowing AI assistants (Claude, ChatGPT, etc.) to interact with chats programmatically via tool use.

**For Assistline:** Convex HTTP actions can serve as a natural MCP-like interface. Exposing these would let external AI tools:
- List and search conversations
- Read message history
- Send messages
- Query user memory context (vector search)
- Approve/deny tool requests

This could be a powerful differentiator: Assistline as an MCP server for customer communication.

---

### 7. Media Viewer Pattern

**Source:** [`beeper/media-viewer`](https://github.com/beeper/media-viewer) — A standalone JavaScript web app that downloads, decrypts, and displays encrypted Matrix media.

**Key configuration variables:**
- `REACT_APP_HOMESERVER_URL` — Matrix homeserver URL
- Media decryption for end-to-end encrypted rooms

**For Assistline:** When adding attachment support to messages, you'll need to resolve Matrix `mxc://` URLs into viewable content in the dashboard. The pattern is:
1. Dashboard requests media via a Convex HTTP action
2. Action proxies to Dendrite's `/_matrix/media/v3/download/{serverName}/{mediaId}`
3. Returns the binary content (or a signed URL)

---

## Medium-Value Patterns

### 8. Bridge Manager CLI

**Source:** `agentremote/tools/bridges` CLI

Beeper manages multiple bridges with a CLI tool:

```bash
./tools/bridges login --env prod
./tools/bridges run codex
./tools/bridges list
./tools/bridges status
./tools/bridges logs codex --follow
./tools/bridges restart codex
./tools/bridges down codex
```

Instances are stored under `~/.config/agentremote/profiles/<profile>/instances/`.

**For Assistline:** Currently a single Node.js listener process. As more bridges are added (Telegram, Discord, etc.), consider:

```text
scripts/
  bridge-manager.ts     # CLI tool for managing bridges
  bridges/
    whatsapp.ts         # mautrix-whatsapp config & lifecycle
    telegram.ts         # mautrix-telegram config & lifecycle (future)
    discord.ts          # mautrix-discord config & lifecycle (future)
```

---

### 9. Rageshake (Bug Reports)

**Source:** [`beeper/rageshake`](https://github.com/beeper/rageshake) — Fork of `matrix-org/rageshake`

A bug report server that collects client logs, app state, and user-described issues.

**Lightweight Assistline version:**

```typescript
bugReports: defineTable({
  description: v.string(),
  conversationId: v.optional(v.id("conversations")),
  logs: v.optional(v.string()),     // Serialized console output
  appState: v.optional(v.string()), // JSON snapshot
  createdAt: v.number(),
  status: v.union(v.literal("open"), v.literal("resolved")),
}),
```

---

### 10. Agent Identity & Capabilities

**Source:** AgentRemote SDK — `sdk.Agent` struct

Beeper defines agents with explicit identity and capability metadata:

```go
Agent: &sdk.Agent{
    ID:           "my-agent",
    Name:         "My Agent",
    Description:  "A custom agent exposed through Beeper",
    ModelKey:     "openai/gpt-5-mini",
    Capabilities: sdk.BaseAgentCapabilities(),
}
```

**For Assistline:** The `aiProviders` table currently stores provider config. Consider a companion table for configurable AI "personas":

```typescript
aiAgents: defineTable({
  name: v.string(),                               // "Customer Support Agent"
  description: v.string(),                         // "Handles inquiries..."
  providerId: v.id("aiProviders"),
  modelKey: v.string(),                            // "openai/gpt-4o"
  systemPrompt: v.optional(v.string()),
  capabilities: v.optional(v.array(v.string())),   // ["text", "vision", "tools"]
  isDefault: v.boolean(),
}),
```

This enables:
- Multiple AI personas (support agent, sales agent, triage agent)
- Per-conversation agent assignment
- Different models for different use cases

---

## Things NOT to Borrow

| Beeper Pattern | Why Skip for Assistline |
|---|---|
| **Go-based bridge SDK** (`agentremote/sdk/`) | Our stack is TypeScript end-to-end — keep it uniform |
| **Synapse homeserver fork** | Dendrite is lighter, Go-native, and we're already set up |
| **Ephemeral Matrix events for AI streaming** | Convex real-time subscriptions are simpler and more reliable |
| **Stainless-generated REST SDK** | Convex auto-generates types from schema — no need for a separate SDK |
| **Matrix room state for AI config** | Convex schema is a better location for per-conversation AI settings |
| **Beeper-specific homeserver patches** | Not needed since we control the full stack via Docker |
| **LinkedIn/Discord/Slack bridges** (immediately) | Focus on WhatsApp bridge maturity first, expand later |

---

## Priority Implementation Roadmap

| Priority | Feature | Effort | Impact | Notes |
|---|---|---|---|---|
| **P0** | Message types + attachments schema | Medium | High | Unlocks rich messaging beyond plain text |
| **P0** | Unread count + read tracking | Low | High | Critical UX signal for inbox management |
| **P1** | Full-text message search | Low | High | Convex search index is a minimal schema change |
| **P1** | AI turn tracking table | Medium | High | Proper AI observability and cost tracking |
| **P1** | Streaming AI via Convex real-time | Medium | High | Core product differentiator |
| **P2** | Tool approval system | Medium | Medium | Human-in-the-loop for AI actions |
| **P2** | Chat archiving / pinning / muting | Low | Medium | Inbox management essentials |
| **P2** | Reply threading | Low | Medium | Better conversation context |
| **P2** | Data drift handling (redactions, edits, read receipts) | Medium | Medium | Listener must handle `m.room.redaction`, `m.replace`, `m.receipt` |
| **P3** | Reactions support | Low | Low | Nice UX addition |
| **P3** | Agent identity / capabilities table | Low | Medium | Multi-model and persona support |
| **P3** | Bridge manager pattern | High | Medium | Needed when adding more networks |
| **P3** | MCP server exposure | Medium | Medium | External AI tool integration |

---

## Key Repos Reference

| Repository | Description | Relevance |
|---|---|---|
| [`beeper/agentremote`](https://github.com/beeper/agentremote) | AI agent bridge SDK + Matrix AI transport spec | **Critical** — streaming, turns, tool approvals |
| [`beeper/desktop-api-js`](https://github.com/beeper/desktop-api-js) | TypeScript SDK for Desktop API (Stainless-generated) | **High** — data models for Chat, Message, User, Attachment |
| [`beeper/media-viewer`](https://github.com/beeper/media-viewer) | Web app for viewing encrypted Matrix media | **Medium** — media rendering pattern |
| [`beeper/synapse`](https://github.com/beeper/synapse) | Customized Synapse homeserver | **Low** — reference only |
| [`beeper/rageshake`](https://github.com/beeper/rageshake) | Bug report server | **Low** — simple concept to replicate |
| [`beeper/bridge-manager`](https://github.com/beeper/bridge-manager) | Self-hosted bridge management | **Low** — future multi-bridge reference |
| [mautrix/*](https://github.com/mautrix) | Matrix bridges for WhatsApp, Telegram, Signal, Discord, Slack, LinkedIn, etc. | **Reference** — already using mautrix-whatsapp |

---

## Key Insight

> **Beeper's biggest recent bet is AgentRemote** — bringing AI agents into the messaging experience. Assistline is architecturally ahead because it has a **persistent vector memory layer** (Convex `user_context` with embeddings) that Beeper completely lacks. Beeper's agents are stateless bridges that connect to external LLMs; Assistline's AI can remember context across conversations and contacts.
>
> **The moat is memory. The things to borrow are UX patterns and data model maturity.**
