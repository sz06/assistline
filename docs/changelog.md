# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
