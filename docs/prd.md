# PRD: Self-Sovereign AI-Powered Unified Inbox

## 1. Project Overview
This project is an open-source, locally-hosted unified messaging inbox. It aggregates conversations from various platforms (WhatsApp, Messenger, etc.) into a single interface while maintaining strict data sovereignty.

The core differentiator is an integrated, LLM-agnostic AI agent that monitors all conversations, builds long-term memory about the user and their contacts, and autonomously suggests context-aware replies and actions. 

*Note on Sovereignty:* True data sovereignty is achieved by configuring a local LLM (e.g., via Ollama). While cloud-based APIs (OpenAI, Anthropic) are supported, using them inherently means messaging context will leave the local network. 

**Infrastructure Goal:** The entire stack must run locally via Docker Compose, securely exposed via a Tailscale network, with a Turborepo monorepo structure (based on the Turbostack template) managing the frontend and backend logic. 

**Target Audience:** Single-user scope. This is designed as a personal assistant, avoiding complex multi-tenant or multi-user access control schemas.

## 2. System Architecture & Tech Stack
The system is entirely decoupled. Messaging protocols are handled by a dedicated ingestion layer, while application logic and state are managed by a reactive backend.

- **Monorepo Tooling:** Turborepo
- **Frontend:** Vite + React (Dashboard & Chat UI)
  - **Styling:** Tailwind CSS v4 + Base UI primitives strictly (via Shadcn UI inspired patterns). No Radix UI primitives.
- **Backend & Database:** Self-hosted Convex (SQLite, Vector Search, Actions/Mutations)
- **Messaging Ingestion:** Matrix Homeserver (**Dendrite** for minimal resource usage) + mautrix bridges (starting with mautrix-whatsapp)
- **Integration Layer:** Custom Node.js Matrix Listener script
- **LLM Integration:** LiteLLM (to standardize API calls for any user-provided model key)
- **Networking:** Tailscale Sidecar (MagicDNS for secure local subdomains)
- **Deployment:** Docker Compose

## 3. Core Components & Responsibilities

### 3.1. Docker & Infrastructure (`/docker`)
- **Compose Setup:** Manage containers for frontend (via Tailscale network mode), convex-backend, Dendrite Matrix homeserver, bridge-whatsapp, and matrix-listener.
- **Tailscale Sidecar:** Wrap the Vite frontend container to expose it securely at `https://dashboard.[tailnet].ts.net` without opening local ports.

### 3.2. Convex Backend (`/packages/db` or `/convex`)
- **Database Schema:** 
  - `aiProviders`: Stores LLM provider names, optionally encrypted keys, and an `isDefault` toggle.
  - `settings`: Key-value store for system configurations.
  - `contacts`: Robust CRM-style profiles (name, phone arrays, email arrays, company, location).
  - `conversations`: Maps Matrix room IDs, tracks the `lastMessageId` and groups.
  - `messages`: Tied to `conversationId`, stores raw text, sender, timestamps.
  - `user_context`: Extracted facts for RAG with a vector index.
- **Configuration Seeding:** A `seedConfig` mutation executed on startup that populates default configs from a `config.json` reference file (e.g. historical backfill settings, default personality).
- **Mutations:** Endpoints for the Matrix Listener to push new messages, auto-creating contacts and conversations if they don't exist.
- **Actions (The Agent):** 
  - Triggered automatically on new message insertion.
  - Embed incoming messages.
  - Interface with the user's chosen Default AI Provider.
  - Output structured JSON representing "Suggested Actions" and/or "Suggested Replies".

### 3.3. Matrix Listener (`/apps/listener` or `/packages/listener`)
- A lightweight Node.js bot that authenticates with Dendrite.
- Listens to the `/sync` endpoint for incoming events from the mautrix bridges.
- **Resilience:** Stores a sync token (cursor) so that on container restart, it doesn't miss messages.

### 3.4. Vite React Dashboard (`/apps/web`)
**Layout & Shell:**
- Left-side Navigation Sidebar containing links to primary views (Conversations, AI Providers, Config, Memory).
- Top Header containing a breadcrumb/title, a Global "AI Toggle" (amber toggle switch to universally pause AI automation), and a Dark/Light Theme toggle.

**Conversations Page (The Inbox):**
- **Two-Pane Layout:**
  - **Left Pane (Conversation List):**
    - Search bar and "New Conversation" `+` button.
    - Inline forms to draft a brand new conversation defining a phone number, first message, Line selection, and toggle (SMS/WhatsApp).
    - Contact list showing avatar initials, display name, an Intent badge (dynamically assigned category like "Status Check", "Chat"), a status dot indicator (e.g., Idle, Waiting for User), and timestamps.
  - **Right Pane (Active Chat):**
    - **Header:** Contact name, Intent Badge, associated contact arrays (WhatsApp LIDs, phones), and a dedicated "Chat AI" switch for granular conversation-level AI pausing. 3-dot menu for deletion.
    - **Message Feed:** Distinct user (left) vs agent (right) chat bubbles. Small icons adjacent to the message explicitly indicate the delivery channel (e.g., WhatsApp icon, SMS icon).
    - **AI Suggestion Blocks (Pinned above compose bar):**
      - *Suggested Actions:* If the AI outputs a JSON tool action (e.g., "upsertProfile"), it renders in an indigo-tinted block with summary text, an emerald "Approve" button, and a grey "Dismiss" button.
      - *Suggested Reply:* Renders in an amber-tinted block. The user can click an "Use Reply" button to populate the compose bar with the draft, or "Dismiss" the suggestion.
    - **Compose Bar:** Dropdown to select the specific outbound bridge/line. Toggle buttons for Outbound Channel (SMS, WA, Email). Main text input and Send button.

**AI Providers Screen:**
- A dedicated page allowing users to add/edit/manage LLM API keys. Features an "Add Provider" dialog modal and the ability to mark one provider as "Default" to drive the system.

**Config Screen:**
- A tabular interface mapped directly to the Convex `settings` table, allowing inline editing of system variables (like polling rates, AI personality instructions) with instant inline "Save" triggers.

**Memory Management Screen:**
- A dedicated UI panel allowing the user to view, manually edit, or delete the extracted facts/memory the AI has stored in the vector database about themselves or their contacts.

## 4. User Flows

### 4.1. Initial Setup
1. User spins up `docker compose up -d`.
2. System runs initialization (`seedConfig`) iterating over `config.json` to safely insert missing required default parameters.
3. User opens the Vite dashboard via Tailscale.
4. User accesses the "AI Providers" page to add an API Key (e.g., OpenAI, Ollama) and sets it to Default.
5. User initiates WhatsApp bridge pairing (UI requests a Matrix bridge QR code).
6. Matrix listener spins up, auto-syncing configured history into the Convex DB as `conversations`, `contacts`, and `messages`.

### 4.2. Message Ingestion & Agent Loop
1. Contact sends a WhatsApp message.
2. Listener captures the event, creates appropriate Convex DB entries.
3. Convex Action parses data via the Default AI Provider, updates RAG memory if new facts are detected, and generates a structured Draft Reply or Action.
4. The Vite UI immediately displays the new chat bubble and the AI's Suggestion Blocks above the compose bar.

### 4.3. Outgoing Message Flow
1. User clicks "Use Reply" on a suggestion, or manually types a message in the compose bar.
2. User ensures the correct source Channel is selected, and clicks Send.
3. Convex Mutation creates the Outbound message and triggers an Action to dispatch the HTTP packet back up through Dendrite to the mautrix bridge.

## 5. Implementation Phases
- **Phase 1: Foundation.** Scaffold Turborepo. Define the `docker-compose.yml` (Dendrite, Bridge, Convex, Tailscale).
- **Phase 2: Database & Schema.** Define Convex schema. Implemented multi-provider `aiProviders`, `settings`, `conversations`, `contacts`, `messages`. Implement JSON-based `seedConfig` pattern.
- **Phase 3: The Listener Layer.** Build the Node.js Matrix listener script with sync-token resilience tracking Matrix -> Convex sync state.
- **Phase 4: Agent Logic.** Implement Convex Actions utilizing the default AI provider for RAG memory extraction and intent/reply classification.
- **Phase 5: Frontend Interface.** Build the Vite React dashboard mirroring the Aileen reference architecture (Two-Pane Inbox, AI toggles, Suggestion Blocks, AI Providers config page).