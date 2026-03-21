# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.19.1] - 2026-03-21

### Changed
- **Contacts Sort Order** (`packages/api`, `apps/dashboard`): Default sort on the contacts page now uses a 3-tier ordering: contacts with a user-set `name` first, then contacts with bridge-provided `otherNames`, then unnamed contacts. Within each tier, contacts are sorted alphabetically (or by creation time for unnamed contacts). This ensures named contacts always appear at the top of the list.

### Fixed
- **Phone Numbers Saved as Other Names** (`packages/api`): When a WhatsApp contact had no display name, the bridge sent their phone number (e.g. "+14155552671 (WA)") as the display name, which was saved as an `otherName`. Now phone-number-like display names (with or without bridge suffixes) are detected via `stripBridgeSuffix` + `isPhoneNumberLike`, skipped as `otherNames`, and the phone number is extracted into `phoneNumbers` instead.

## [2.19.0] - 2026-03-21

### Changed
- **Unified Init Container** (`docker`): Merged `convex-deployer` and `matrix-setup` into a single `assistline-init` container. It runs both Matrix bot setup (user creation, access token) and Convex function deployment in one shot on every `docker compose up`. Source code (`packages/api`, `packages/config`) is now volume-mounted read-only instead of baked into the image, so the container always deploys the latest code from disk — no more stale schemas after restarts.
- **README Rewrite**: Replaced the stale Turbostack template README with AssistLine's actual architecture, 4-step quick start, development workflows table, environment variables reference, and tech stack.

### Added
- **Auto Seed Data** (`docker/assistline-init`): Phase 3 of the init container now calls the `seedData` mutation via the Convex HTTP API to populate default config entries and roles on first boot.
- **`pnpm listener:rebuild`** (`package.json`): One-command rebuild and restart of the `matrix-listener` container.
- **`pnpm deploy`** (`package.json`): Full-stack deploy — pushes Convex functions and rebuilds the listener in one command.
- **Admin Password** (`.env.example`, `scripts/setup.mjs`): Added `MATRIX_ADMIN_USERNAME` / `MATRIX_ADMIN_PASSWORD` to the env template and auto-generation script.

### Removed
- **`convex-deployer`** container (`docker`): Replaced by `assistline-init`.
- **`matrix-setup`** container (`docker`): Replaced by `assistline-init`.

## [2.18.1] - 2026-03-21

### Changed
- **Narrower Sidebar** (`packages/ui`): Reduced sidebar width from `w-64` (256px) to `w-48` (192px) and tightened header padding from `px-6` to `px-4`. The longest nav label ("Conversations") fits comfortably at the new width.

### Added
- **Roles on Contact Form** (`packages/api`, `apps/dashboard`): The contact add/edit page now includes a "Roles" section with toggle chips for every system-defined role. Role IDs are stored on the contact document and persist across edits. Backend `contactFields` validator updated to accept `roles`.

## [2.18.0] - 2026-03-21

### Added
- **Artifactor Agent** (`packages/api`): New internal agent that receives extracted facts from Chatter and automatically persists them as artifacts. Uses vector search (`by_embedding` index) to find semantically similar existing artifacts and decides whether to create new rows or update existing ones. Facts about the user (e.g. home address, preferences) are assigned the "User" role for access control.
  - `agents/artifactor/agent.ts` — Entry point (`processFacts` internalAction) that creates a one-off thread and runs the agent.
  - `agents/artifactor/tools.ts` — Four tools: `searchArtifacts` (vector search + hydration), `createArtifact` (embed + insert), `updateArtifact` (re-embed + patch), `done`.
  - `agents/artifactor/prompt.ts` — System prompt for search-then-decide logic.
- **Embedding Action** (`packages/api`): New `ai/embeddings.ts` with `embedText` internalAction for generating embeddings via the default embedding provider. Reusable across agents and features.
- **Artifact Internal Mutations** (`packages/api`): Added `fetchByIds` internalQuery, `internalCreate` and `internalUpdate` internalMutations to `artifacts.ts` for agent use.

### Changed
- **Chatter → Artifactor Handoff** (`packages/api`): Chatter's `suggestReply` and `noReplyNeeded` tools now schedule the Artifactor agent asynchronously via `ctx.scheduler.runAfter` when extracted facts are present, replacing the previous console.log-only behavior.
- **Audit Log Sources** (`packages/api`, `apps/dashboard`): Migrated `source` field from `auto|manual` to `user|agent|system` across schema, validators, and all callsites. `user` = dashboard actions, `agent` = Chatter/Artifactor actions, `system` = listener events and cron jobs.

## [2.17.2] - 2026-03-21

### Added
- **ConversationDrawer** (`packages/ui`): New presentational drawer component that slides in from the right, combining AI settings (Enable AI, Auto Post Reply, Auto Perform Actions toggles, token usage stats) and a bottom-pinned "Delete Chat" action. Built on `@base-ui/react/drawer`. Added Storybook stories with three variants (Default, AIEnabled, AllFeaturesOn).

### Changed
- **Conversation Header** (`apps/dashboard`): Replaced the separate AI settings dropdown and 3-dot menu with the unified `ConversationDrawer`. The ⋮ icon now opens the drawer with all conversation settings.

## [2.17.1] - 2026-03-20

### Added
- **Entity Glossary** (`docs`): New `glossary.md` defining canonical names for all 17 system entities (User, Contact, Identity, Participant, Conversation, Message, Channel, Platform, Agent, Thread, Provider, Action, Artifact, System, Role, Config, Audit Log). Organized into Core, Messaging, AI, and System categories with schema mappings and usage examples.

### Changed
- **Renamed "Self" role → "User"** (`packages/api`): The seed role previously called "Self" is now "User" to align with the entity glossary and eliminate redundancy.
- **Terminology alignment** (`packages/api`, `apps/dashboard`, `apps/listener`): Aligned comments, variable names, and string literals across 13 files with the entity glossary:
  - `contactDetails` → `participantDetails` in conversation queries/helpers and dashboard UI (clearer for group conversations).
  - `dashboard_user` sender → `system` in outbound message helper.
  - `selfPhone` → `userPhone`, `selfPuppetIds` → `userPuppetIds` in conversation helpers and listener.
  - Agent prompt: "knowledge base" / "memories/facts" / "memory" → "artifacts"; "the person" → "the contact" / "the user".
  - Schema comments: "memory value" → "artifact value", clearer channel/participant annotations.
  - Chatter action schema: "fact or memory value" → "artifact value".

## [2.17.0] - 2026-03-20

### Fixed
- **Agent turn-order error** (`packages/api`): The Chatter agent crashed with "function call turn comes immediately after a user turn" when processing outgoing messages. Root cause: outgoing messages were saved as `role: "assistant"` in the agent thread, creating back-to-back assistant turns. Now all conversation messages are saved as `role: "user"` with sender labels (e.g. `[Contact]`, `[User (you)]`) since they're context for the agent, not its own output.

### Changed
- **`settings` → `config` table** (`packages/api`): Renamed the `settings` Convex table to `config` and changed `value` from `v.any()` to `v.string()` for type safety. All references updated across `matrixActions.ts`, `init.ts`, and the listener.
- **Flattened `config.json`** (`packages/api`): Nested config values (e.g. `historicalFetchSize.conversations`) are now stored as dot-separated flat keys with string values.
- **Renamed `seedConfig` → `seedData`** (`packages/api`): The seed mutation name now reflects that it seeds both config entries and roles.

### Added
- **Config Page** (`apps/dashboard`): Table-based config editor at `/config` replacing the stub. Displays all config key-value pairs with inline editing and per-row save buttons.
- **`config.list` query** (`packages/api`): New query to fetch all config entries for the dashboard.
- **`getConfigNumber` helper** (`packages/api`): Reusable function for reading numeric config values from the `config` table with a typed fallback.
- **Config-driven fetch sizes** (`packages/api`): Conversation list and message fetch limits now read from `historicalFetchSize.conversations` and `historicalFetchSize.messagesPerConversation` config keys instead of using hardcoded values.

### Removed
- **`settings.ts`** (`packages/api`): Replaced by `config.ts`.

## [2.16.2] - 2026-03-20

### Added
- **Agent Time Awareness** (`packages/api`): The Chatter agent's system prompt now includes the current date and time (ISO 8601). This lets the agent understand relative time expressions ("tomorrow", "next week") and adjust tone based on time of day.

## [2.16.1] - 2026-03-20

### Fixed
- **Auto Post Reply / Auto Perform Actions not working** (`packages/api`): The Chatter agent's `suggestReply` tool always stored suggestions as a card for manual approval, even when `autoSend` was enabled. Now it reads the conversation's `autoSend` flag and sends the reply directly via Matrix when enabled. Same fix applied to `suggestActions` / `autoAct` — actions are executed immediately when the flag is on. Added `internalSendMessage` (messages) and `internalExecuteSuggestedAction` (conversations/mutations) for agent-side execution that avoids infinite loops.

### Changed
- **Removed `color` from roles** (`packages/api`): Dropped the optional `color` field from the `roles` schema, CRUD mutations, and seed data. Role styling will be handled in the UI layer instead.
- **Split `messages.ts` into `messages/`** (`packages/api`): Refactored the monolithic `messages.ts` into `messages/queries.ts`, `messages/mutations.ts`, and `messages/helpers.ts`. Extracted the shared outbound-message logic (`insertOutboundMessage` helper) used by both `sendMessage` and `internalSendMessage`. Updated all references across the listener, dashboard, and agent tools to use submodule paths (e.g. `api.messages.mutations.insertMessage`).

### Added
- **"Self" role** (`packages/api`): Added a "Self" role to `roles.json` for personal artifacts and private notes that should only be accessible to the user.

## [2.16.0] - 2026-03-20

### Added
- **Default Roles Seed** (`packages/api`): New `roles.json` with 7 default roles (Family, Friend, Colleague, Client, Vendor, VIP, Blocked). The `seedData` mutation in `init.ts` now seeds these roles into the `roles` table alongside config entries, skipping any that already exist.
- **Chatter `listRoles` Tool** (`packages/api`): New read-only tool that returns all system-defined roles. The Chatter agent now calls `listRoles` on its first turn so it knows which roles exist before suggesting `assignRole` actions. Added `listInternal` internalQuery to `roles.ts`.
- **Role-Aware Prompt** (`packages/api`): Updated Chatter's system prompt with a dedicated ROLES section explaining what roles are, when to call `listRoles`, and a constraint that the agent must only assign roles that actually exist.

## [2.15.0] - 2026-03-20

### Added
- **Per-conversation AI token tracking** (`schema.ts`, `mutations.ts`): Added `aiTokensIn` and `aiTokensOut` fields to conversations table, with `incrementTokenUsage` internal mutation. The Chatter agent's `usageHandler` atomically increments these counters after each LLM call.
- **Execute suggested actions** (`conversations/mutations.ts`): New `executeSuggestedAction` mutation that parses action JSON, dispatches by type (updateContact, createArtifact, assignRole), executes the write, and removes the action from the list.

### Fixed
- **Suggested action approve button** (`ConversationsPage.tsx`): The approve button was a dead button with no `onClick` handler. Now wired to `executeSuggestedAction`.

### Changed
- **Chatter tools write directly** (`agents/chatter/tools.ts`): Response tools (`suggestReply`, `suggestActions`, `noReplyNeeded`) now accept `conversationId` and write directly to the conversation via `ctx.runMutation`, eliminating fragile manual step iteration.
- **Simplified agent handler** (`agents/chatter/agent.ts`): Removed the entire post-`generateText` tool call extraction loop. Added `usageHandler` for token tracking. Agent handler is now ~50 lines shorter.
- **Docker self-hosted URL fix** (`docker-compose.yml`): Added `CONVEX_CLOUD_ORIGIN` and `CONVEX_SITE_ORIGIN` environment variables to the Convex backend container, fixing the `Invalid URL` error when running agents on self-hosted Convex.
- **Redesigned suggested action cards** (`ConversationsPage.tsx`): Replaced raw JSON strips with structured cards showing CRUD type badges (green Add, blue Update, purple Assign), field-level data display, and operation-specific colors.

## [2.14.0] - 2026-03-20

### Changed
- **Split `conversations.ts`** into `conversations/queries.ts`, `conversations/mutations.ts`, and `conversations/helpers.ts`. Updated all references across the dashboard, listener, and agent code. API paths now use submodule notation (e.g. `api.conversations.queries.list`, `api.conversations.mutations.markAsRead`).
- **Chatter Agent → Convex Agent Component** (`packages/api`): Migrated from Vercel AI SDK `generateText` with structured output to `@convex-dev/agent@0.6.0-beta.0`. The agent now uses persistent threads, automatic context management, and native tool calling instead of a custom query-action loop.
  - **Thread-based context** (`agents/chatter.ts`): Each conversation gets an `agentThreadId`. Messages sync into the agent thread via `saveMessage`; the LLM receives automatic context from thread history.
  - **Native tool calling** (`agents/tools.ts`): Replaced `queryActions` with `createTool` wrappers (`getContactProfile`, `getConversationHistory`, `getArtifacts`). Response is captured via `suggestReply`, `suggestActions`, and `noReplyNeeded` tools. Backing queries live in their domain files (`contacts.ts`, `messages.ts`, `artifacts.ts`).
  - **Simplified schema** (`agents/schema.ts`): Removed `ChatterResponseSchema` and `queryActions` (now handled by tool calls). Kept `ChatterMutationSchema` and added `INTENTS` enum.
  - **Updated prompt** (`agents/prompt.ts`): Rewritten for tool-based architecture.
- **AI Settings dropdown** (`ConversationsPage.tsx`): Replaced single AI toggle with a dropdown containing 3 switches (Enable AI, Auto Post Reply, Auto Perform Actions) using Base UI `Switch` primitive. Auto Send/Auto Act are disabled when AI is off.

### Added
- **`agentThreadId`** on `conversations` schema — links each conversation to its Convex Agent thread for persistent LLM context.
- **`autoSend` and `autoAct` toggles** (`packages/api`): Two optional booleans on `conversations`. `autoSend` auto-sends suggested replies; `autoAct` auto-executes mutationActions. Both default to false.
- **`updateAISettings` mutation** (`conversations.ts`): Flexible mutation to set any combination of `aiEnabled`, `autoSend`, `autoAct`.
- **`convex.config.ts`**: Registers the `@convex-dev/agent` component with `app.use(agent)`.
- **`getByIdInternal`** query on `conversations` — simple internal getter for the Chatter agent.

### Removed
- **`agents/queries.ts`**: Replaced by the agent playground's built-in prompt inspection.
- **`agents/toolQueries.ts`**: Queries moved to their domain files (`contacts.ts`, `messages.ts`, `artifacts.ts`).

## [2.13.1] - 2026-03-20

### Fixed
- **Outgoing Messages Not Delivered** (`packages/api`): Messages sent from the dashboard were inserted into the database but never relayed to the Matrix homeserver, so contacts never received them. Added a `sendMatrixMessage` internalAction that calls the Matrix `PUT /send/m.room.message` endpoint and patches the message with the real event ID. The `sendMessage` mutation now schedules this action asynchronously via `ctx.scheduler.runAfter`.

## [2.13.0] - 2026-03-20

### Changed
- **Contacts Page Redesign** (`apps/dashboard`): Replaced the card grid layout with a sortable data table. Contacts are now displayed as rows with columns for name, company, phone, email, and date added. Sortable column headers (name, company, added) toggle ascending/descending. Client-side pagination with configurable page size (10/25/50), prev/next navigation, and "X–Y of Z" range indicator. Responsive — phone, email, and date columns hide at smaller breakpoints. Rows show nickname and other names below the contact's display name.
- **`otherNames` Simplified** (`packages/api`): Changed `otherNames` from `{ source: string; name: string }[]` to `string[]`. Bridge-provided display names (e.g. "Shahzaib (WA)") are now stored as plain strings. Updated schema, validators, `messages.ts` insert/update logic, and `conversations.ts` display-name resolution.
- **Contact Form** (`apps/dashboard`): `otherNames` field is now an editable list of plain text inputs on both Add and Edit contact pages.

## [2.12.0] - 2026-03-20

### Changed
- **Contact Auto-Creation** (`packages/api`): The `name` field is no longer auto-filled from bridge display names — it is now exclusively user-controlled. Bridge-provided names (e.g. WhatsApp contact names) are stored in a new `otherNames` array with source attribution. Phone numbers are stored as digits only (no `+` prefix). Existing contacts with phone-number-like names are migrated on next message.
- **Display Name Fallback** (`packages/api`, `apps/dashboard`): Conversation list, chat headers, sender labels, and contact cards now follow the chain: `name` → `otherNames[0].name` → Matrix ID → "Unknown".

### Added
- **`otherNames` field** (`packages/api`): New `otherNames: [{ source, name }]` array on the `contacts` table for platform-provided display names.
- **Other Names UI** (`apps/dashboard`): The contact edit page shows `otherNames` as read-only source-badged chips.

## [2.11.1] - 2026-03-20

### Fixed
- **Outgoing Messages Shown as Incoming** (`apps/listener`): Messages sent from the user's WhatsApp phone app were displayed as incoming in the dashboard because the self-puppet Matrix ID was built with a `+` prefix (from the stored phone number) while mautrix-whatsapp creates puppet IDs without it. Stripped the leading `+` so the IDs match.

## [2.11.0] - 2026-03-19

### Added
- **Provider Type** (`packages/api`, `apps/dashboard`): AI providers now have a `type` field — `"language"` or `"embedding"`. Defaults are tracked per-type (one default language, one default embedding). New `by_type` index on `aiProviders`. The Add Provider form includes a type toggle and filters provider options (e.g., only OpenAI and Google appear for embedding). ProvidersPage shows two sections: "Language Models" and "Embedding Models".
- **Autocomplete Model Selector** (`apps/dashboard`): Replaced the plain `<select>` model dropdown with a searchable Base UI `Autocomplete` component. Supports type-to-filter, clear, empty state, and keyboard navigation. Added `@base-ui/react` as a dashboard dependency.

## [2.10.1] - 2026-03-19

### Changed
- **Artifacts: Removed `key` field** (`packages/api`, `apps/dashboard`): Artifacts no longer use a deterministic `key` for upserts. The `save` mutation has been split into separate `create` and `update` mutations that operate by document `_id`. The `by_key` index has been dropped. This simplifies the schema and aligns with the intended AI workflow where semantic search discovers existing artifacts and updates them by ID.
- **Artifact Form** (`apps/dashboard`): Removed the key input field from the add/edit form. Description is now the primary label for each artifact.

## [2.10.0] - 2026-03-19

### Added
- **Audit Logs** (`packages/api`, `apps/dashboard`): System-wide audit trail that records every mutation across the app. Each log entry captures the action, source (`auto` for listener/AI actions, `manual` for dashboard-triggered actions), entity, entity ID, details, and timestamp. New `auditLogs` table with `by_timestamp`, `by_entity`, and `by_action` indexes. Internal `log` mutation scheduled non-blockingly via `ctx.scheduler.runAfter(0, …)` from all existing mutations across `contacts`, `conversations`, `messages`, `channels`, `aiProviders`, `roles`, and `artifacts`.
- **Audit Logs Page** (`apps/dashboard`): Premium timeline page at `/audit-logs` with source filter pills (All/Auto/Manual), entity dropdown filter, text search, action-specific icons, auto/manual badges, relative timestamps, and empty state.
- **E2E Tests** (`apps/e2e`): Playwright page object and test spec for the Audit Logs page covering rendering, source/entity filtering, and search.

## [2.9.1] - 2026-03-19

### Fixed
- **WhatsApp Contact Phone-as-Name** (`packages/api`): When a WhatsApp user has no contact name, the bridge sends their phone number as the display name. This was being saved in the `name` field; now it is detected as a phone number and stored in `phoneNumbers` (cleaned, digits only) with the `name` left empty.
- **Missing Phone Numbers on Named Contacts** (`packages/api`): Contacts already created via the listener were never updated with new information. Now, on each incoming message, existing contacts are patched with any missing name, phone number, or avatar.
- **Phone Contact Names Not Used** (`packages/api`): Same root cause as above — when a WhatsApp user is saved in the phone's address book, their real name is now correctly back-filled into existing contacts on subsequent messages.
- **DM Header Shows Self Instead of Contact** (`packages/api`): In DM conversations, the header was showing the user's own contact info instead of the other person's. Fixed by using the channel's `phoneNumber` to identify the user's own WhatsApp puppet and exclude it, resolving the other participant's contact for the header.
- **Own WhatsApp Messages Classified as Incoming** (`apps/listener`): Messages sent from the user's WhatsApp phone were incorrectly classified as "in" because the bridge puppet (`@whatsapp_<phone>:matrix.local`) was not recognized as "self". The listener now builds a `selfPuppetIds` set from each channel's connected phone number and treats those senders as "out". Self-puppets are also excluded from room member counts.

### Added
- **Contact Utilities** (`packages/api`): New `isPhoneNumberLike` and `cleanPhoneNumber` helper functions in `convex/utils/contacts.ts` with full unit test coverage.
- **Message Sender Names** (`packages/api`, `apps/dashboard`): The `getWithMessages` query now resolves sender display names via `contactIdentities` → `contacts` for every message. The chat UI shows sender names above each message bubble (teal label for incoming, white for outgoing). Group conversations also show a small initial avatar next to incoming messages.
- **Reactions** (`apps/listener`, `packages/api`, `apps/dashboard`): Emoji reactions on WhatsApp messages now sync into the app via `m.reaction` Matrix events. Reactions appear below message bubbles with sender counts. Backend mutations: `addReaction`, `removeReaction`.
- **Message Deletions** (`apps/listener`, `packages/api`, `apps/dashboard`): When a WhatsApp message is deleted, `m.room.redaction` events are processed and the message is soft-deleted. Deleted messages display a "🚫 This message was deleted" placeholder.
- **Message Edits** (`apps/listener`, `packages/api`, `apps/dashboard`): Edited WhatsApp messages (`m.replace` relation type) are detected and updated in the database. Edited messages show an "(edited)" label next to the timestamp.
- **Read Receipts & Unread Counts** (`apps/listener`, `packages/api`, `apps/dashboard`): Bidirectional read receipts — `m.receipt` ephemeral events from Matrix sync reset unread counts, and opening a conversation in the dashboard sends a read receipt back to Matrix/WhatsApp (blue checkmarks). Incoming messages increment `unreadCount`; unread badges appear on conversation list items.
- **Typing Indicators** (`apps/listener`, `packages/api`, `apps/dashboard`): `m.typing` ephemeral events are processed. An animated typing dots bubble appears when the other person is typing in WhatsApp.
- **Media Message Support** (`apps/listener`, `packages/api`, `apps/dashboard`): The listener now handles `m.image`, `m.video`, `m.audio`, `m.file` msgtypes in addition to `m.text`. Messages are typed and display attachment type indicators (📷 Image, 🎬 Video, etc.).

## [2.9.0] - 2026-03-19

### Changed
- **Schema Simplification** (`packages/api`): Removed the `groups` table entirely. Group metadata (`memberCount`, `participants`, `topic`) is now stored directly on the `conversations` table. The `isGroup` boolean and `groupId` reference have been replaced — group status is derived from `memberCount > 2`.
- **Schema Tightening** (`packages/api`): Made `channelId`, `memberCount`, and `participants` required on `conversations`. Made `eventId` required on `messages`. These fields are always populated by the listener and outbound flows.
- **Conversations Queries** (`packages/api`): Removed the join to the `groups` table in `list` and `getWithMessages`. Group name, topic, and member count are now read directly from the conversation document.
- **Message Mutations** (`packages/api`): `insertMessage` and `syncConversationMeta` now accept `channelId`, `memberCount`, `participants`, and `topic` as required args.
- **Matrix Listener** (`apps/listener`): Resolves `channelId` from bridge bot members on startup and passes it to all Convex mutations. No longer syncs a separate groups table.
- **Conversations UI** (`apps/dashboard`): Updated `ConversationsPage.tsx` and `SimulatorPage.tsx` to use the new required fields without nullish fallbacks.

### Added
- **`channels.getByType` query** (`packages/api`): Allows looking up a channel by platform type (whatsapp, telegram).

### Removed
- **`groups` table** (`packages/api`): Deleted the `groups` Convex table and `groups.ts` module.
- **`by_groupId` index** (`packages/api`): Removed from the `conversations` table.

## [2.8.0] - 2026-03-19

### Added
- **Channel Sidebar** (`apps/dashboard`): Beeper-style narrow vertical channel sidebar on the Conversations page. Displays an "All" inbox icon and per-channel brand icons (WhatsApp, Telegram) with status dots and hover tooltips. Clicking a channel filters the conversation list; search applies on top of the filtered results. Mobile shows a horizontal channel strip.
- **`channelId` on Conversations** (`packages/api`): Added optional `channelId` field and `by_channelId` index to the `conversations` table, and updated `conversations.list` to accept an optional `channelId` filter.
- **Shared Channel Icons** (`apps/dashboard`): Extracted `WhatsAppIcon` and `TelegramIcon` into a reusable `ChannelIcons.tsx` component with a `channelIconMap` and brand color map.

### Changed
- **Channels Page** (`apps/dashboard`): Refactored `ChannelsPage.tsx` to use shared icon components from `ChannelIcons.tsx`, with dynamic icon and color selection per channel type.

## [2.7.0] - 2026-03-19

### Changed
- **Form Validation** (`apps/dashboard`): Refactored all form pages (`ContactFormPage`, `ProviderFormPage`, `ChannelFormPage`, `SimulatorPage`) from manual `useState`-based state management to **Zod** schemas with **react-hook-form**. This adds type-safe validation, inline error messages, and uses `useFieldArray` for dynamic lists (phones, emails, addresses). Conditional validation (e.g. API key required only for cloud providers) uses Zod's `.refine()`.

### Added
- **Dependencies** (`apps/dashboard`): Added `zod`, `react-hook-form`, and `@hookform/resolvers` packages.

## [2.6.0] - 2026-03-19

### Changed
- **Contacts Schema** (`packages/api`): Merged `firstName` and `lastName` into a single `name` field across the Convex schema, mutations, and queries. This simplifies contact creation from the Matrix listener and aligns with how display names are received from WhatsApp.
- **Contact Form** (`apps/dashboard`): Replaced the separate First/Last name inputs with a single "Full Name" field. The save-button guard now requires either `name` or `nickname`.
- **Contact Cards** (`apps/dashboard`): Updated initials generation and display name helpers to use the new `name` property.
- **E2E Tests** (`apps/e2e`): Updated page objects and test specs to use the consolidated `name` field.

## [2.5.0] - 2026-03-19

### Changed
- **Channels & Providers** (`apps/dashboard`): Replaced dialog/modal-based add and edit flows with dedicated full-page routes (`/channels/add`, `/channels/:id/update`, `/providers/add`, `/providers/:id/update`) matching the contacts pattern.
- **Channel Cards** (`apps/dashboard`): Simplified channel cards — clicking navigates to the update page. Delete uses a centered confirmation modal. Connection management (connect, disconnect, QR code) moved to the channel update page.

### Added
- **`channels.update` mutation** (`packages/api`): New public mutation to patch a channel's label and type.
- **`ChannelFormPage`** (`apps/dashboard`): Full-page form for adding/editing channels with a connection status section (connect/disconnect, QR code display).
- **`ProviderFormPage`** (`apps/dashboard`): Full-page form for adding/editing AI providers with provider selection tiles, API key input, and dynamic model selector.
- **Provider `name` field** (`packages/api`): Optional name field on AI providers to distinguish between multiple keys for the same provider (e.g. "Work OpenAI", "Personal key").
- **Multi-key providers**: Users can now add multiple instances of the same provider with different API keys and names.
- **E2E Tests** (`apps/e2e`): Playwright page objects and test specs for both channels and providers pages.

## [2.4.0] - 2026-03-19

### Added
- **Contacts Page** (`apps/dashboard`): Full CRUD page at `/contacts` for managing contacts. Features a responsive card grid with gradient initials avatars, expandable detail view (phone, email, address, company, birthday, notes), searchable by name/company/phone/email, add/edit modal dialogs with multi-value phone/email/address fields, and an empty state.
- **Convex `contacts` module** (`packages/api`): Backend CRUD functions (`list`, `get`, `create`, `update`, `remove`) for the `contacts` table. The `remove` function cascade-deletes linked `contactIdentities` rows.
- **Sidebar navigation**: Added "Contacts" link with `Users` icon to the dashboard sidebar, placed after "Conversations".
- **E2E Tests** (`apps/e2e`): Playwright page object (`page-objects/contacts.ts`) and test spec (`specs/contacts.spec.ts`) covering page rendering, contact creation, editing, search filtering, empty state, and expanded card details.

### Changed
- **Contacts Page** (`apps/dashboard`): Removed delete capability from the contacts UI — contacts can only be created and edited.
- **AI Providers Card** (`apps/dashboard`): Enhanced provider card with a two-section layout. The header now shows the selected model as a distinct monospace chip, a Cloud/Local type pill, and the provider description tagline. A new details footer displays a green/amber health status indicator, a masked API key preview (last 4 chars), and the "Added on" creation date.

## [2.3.0] - 2026-03-18

### Added
- **Groups Table** (`packages/api`): New `groups` Convex table to store WhatsApp/Telegram group metadata — name, topic, avatar, member count, and full member list with display names and roles. Indexed by `matrixRoomId` for fast lookups.
- **Group Detection** (`apps/listener`): The Matrix listener now fetches room membership and state for each active room to determine if it's a group (3+ joined members, excluding bridge bots). Groups are automatically synced to Convex via the new `groups.syncGroup` mutation, and conversation records are patched with `isGroup: true` and a `groupId` reference.
- **Groups CRUD** (`packages/api`): New `groups.ts` module with `list`, `get`, `getByRoomId`, `syncGroup` (upsert), and `remove` functions.
- **`syncConversationMeta` mutation** (`packages/api`): New mutation in `messages.ts` that the listener calls to update an existing conversation's `isGroup`, `name`, `groupId`, and `avatarUrl` fields after fetching room state.

### Changed
- **Conversations Schema** (`packages/api`): Added optional `groupId` field (reference to `groups` table) and `by_groupId` index to the `conversations` table.
- **`insertMessage` mutation** (`packages/api`): Now accepts optional `isGroup`, `roomName`, and `groupId` parameters so new conversations are correctly tagged at creation time. Existing conversations are patched with group info if previously uncategorized.
- **Conversations Queries** (`packages/api`): Both `list` and `getWithMessages` now fetch and return `groupDetails` (name, topic, memberCount, avatarUrl) for group conversations.
- **Conversations UI** (`apps/dashboard`): Group conversations now display a purple gradient avatar with a `Users` icon, a member count badge, and the group topic as the subtitle. The chat panel header is similarly updated for groups.

## [2.2.0] - 2026-03-18

### Changed
- **Vite Plugin** (`apps/dashboard`): Switched from `@vitejs/plugin-react-swc` to `@vitejs/plugin-react` v6 to eliminate the "no swc plugins are used" warning on Vite 8 / Rolldown.
- **Dashboard Version** (`apps/dashboard`): Bumped package version from `1.0.0` → `1.1.0`.

### Fixed
- **WhatsApp Pairing** (`packages/api`): Fixed "Timed out waiting for QR code" error by sending the bridge command with the required `!wa` prefix (`!wa login qr` instead of `login qr`). The mautrix-whatsapp bridge only accepts unprefixed commands in the management room; since each pairing attempt creates a new DM room, the prefix is mandatory.
- **Matrix Listener** (`apps/listener`): Fixed `M_UNKNOWN_TOKEN` crash loop by adding automatic re-login logic. When the access token is rejected (e.g. after a Dendrite restart), the listener now re-authenticates using the bot's username/password, persists the new token, and clears the stale sync token before restarting the sync loop.
- Removed all `as any` Convex ID casts in `ConversationsPage.tsx` — now uses proper `Id<"conversations">` type throughout.
- Fixed Biome lint violations across dashboard pages: added explicit `type="button"` to all `<button>` elements, replaced non-null assertion with safe `??` fallback, and replaced `catch (error: any)` with `unknown` in `SimulatorPage.tsx`.

### Added
- **Vercel AI SDK Integration** (`packages/api`): Added `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/groq`, and `zod` as dependencies. Created `convex/ai/engine.ts` (provider-agnostic model resolution) and `convex/ai/models.ts` (Convex action to fetch available models from each provider's API at runtime).
- **Dynamic Model Discovery** (`apps/dashboard`): The AI Providers page now fetches available models from the provider's API at runtime using the user's API key, instead of relying on hardcoded model lists. The model selector shows a loading state while fetching and supports manual refresh.
- **AI Providers Page** (`apps/dashboard`): Full CRUD page at `/providers` for managing LLM providers (OpenAI, Anthropic, Google AI, Ollama, Groq). Features provider cards with default badge and API key status, add-provider dialog with selectable tiles and **model selector** (e.g. GPT-4o, Claude Sonnet 4, Gemini 2.0 Flash), edit dialog for model/API keys, set-as-default, and inline delete confirmation. Empty state shows clickable provider preview tiles.
- **Convex `aiProviders` module** (`packages/api`): Backend CRUD functions (`list`, `get`, `getDefault`, `create`, `update`, `remove`, `setDefault`) for the `aiProviders` table, with automatic un-defaulting logic when setting a new default.
- **`pnpm convex:push`** script: One-command deploy of Convex functions from `packages/api` to the Docker-hosted Convex backend. Automatically fetches the admin key from the running container and sets the correct self-hosted env vars.
- **Conversations Page** (`apps/dashboard`): Wired the full `ConversationsPage` component into the router, replacing the inline placeholder stub. The page features a searchable conversation list, real-time chat panel, AI auto-reply toggle, suggested replies/actions, and conversation deletion.
- **Matrix Listener** (`apps/listener`): Rewritten to use direct Matrix Client-Server API via `fetch`, removing the `matrix-bot-sdk` dependency and its native addon issues. Supports sync-token persistence, auto-join on invite, and forwarding messages to Convex.
- **Convex Auto-Deployer** (`docker/convex-deployer`): Init container that auto-deploys Convex functions and schema to the self-hosted backend on every `docker compose up`. Generates an admin key from the shared credentials volume.
- **Matrix User Setup** (`docker/matrix-setup`): Init container that auto-creates the admin and bot users on Dendrite, then saves the bot's access token to a shared volume for the listener.
- **Convex Dashboard** service: Added `ghcr.io/get-convex/convex-dashboard` at `http://localhost:6791` for inspecting data, functions, and logs.
- **Synapse Admin** service: Added `awesometechnologies/synapse-admin` at `http://localhost:8010` for managing Dendrite users and rooms.
- **Centralized environment config**: Single `.env.example` at the project root with all credentials. `pnpm setup:envs` generates crypto-random passwords and secrets, creates `.env.local`, updates `dendrite.yaml`, and copies env to `docker/.env`.
- **Bot setup script** (`docker/setup-bot.sh`): Helper script to create the Matrix bot user on Dendrite and retrieve an access token.

### Removed
- Removed `@apps/app` project.

### Fixed
- Fixed theme toggle in `apps/dashboard` by adding the `@custom-variant dark` directive for Tailwind v4 class-based dark mode in `index.css`.
- Fixed Simulator page crash caused by Docker Convex backend stealing host port 3210 from the local `convex dev` process. Changed Docker Convex service from `ports` to `expose` so it only listens within the Docker network.

## [2.1.0] - 2026-03-17

### Changed
- **Dependency Upgrade:** Bumped dependencies across the monorepo to the latest available versions, including `@clerk/nextjs` (v6 → v7), `vite` (v7 → v8), `@biomejs/biome` (v2.4.7), and others.
- Refactored `apps/www/app/page.tsx` to use the new `<Show>` component from Clerk v7, replacing deprecated `<SignedIn>` and `<SignedOut>` components.

## [2.0.0] - 2026-02-26

### Summary
Major monorepo restructuring: dropped React Native/Expo in favor of Capacitor-ready Vite app, split web presence into marketing site (www) and app (app).

### Added
- New `apps/app` — Vite + React + SWC + TypeScript SPA with service worker, fixed dev port 5173, and Tailwind CSS v4. Ready for Capacitor native builds.

### Changed
- **Renamed** `apps/web` → `apps/www` for marketing/landing pages (Next.js).
- **Removed** service worker from `apps/www` (push notifications moved to `apps/app`).
- **Dependency Upgrade:** Updated all core packages — Next.js 16.1.6, Convex 1.32.0, Tailwind CSS 4.2.1, Storybook 10.2.13, Playwright 1.58.2, Clerk 6.38.2, Base UI 1.2.0, Lucide 0.575.0, Biome 2.4.4.

### Removed
- `apps/native` (Expo/React Native app) — replaced by Capacitor strategy via `apps/app`.

## [1.0.0] - 2026-01-20

### Summary
TurboStack 1.0.0: A premium, production-ready monorepo for building type-safe applications with Next.js, Expo, Convex, and Clerk. Standardized on Tailwind v4, shadcn/ui, Base UI primitives, and the Biome toolchain.

### Added
- Feature cards for Biome Toolchain and Vercel Analytics Ready on the landing page.
- Comprehensive `AGENTS.md` guidelines for development standards.

### Changed
- **Version Upgrade:** Bumped all core packages to version `1.0.0`.
- **Dependency Refresh:** Updated all dependencies to their latest stable versions (Next.js 16, Convex 1.17+, Lucide 0.469+).
- **Tooling:** Replaced ESLint/Prettier with Biome for 25x faster linting and formatting.
- **UI Architecture:** Standardized on `shadcn/ui` and `Base UI`. Explicitly removed `Radix UI` primitives in favor of `Base UI`.
- **Documentation:** Complete overhaul of `README.md` and project metadata.
