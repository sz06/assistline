# AssistLine

A self-hosted, AI-powered messaging assistant that bridges WhatsApp (and soon Telegram) into a unified dashboard. Messages flow through a Matrix homeserver, get processed by AI agents, and surface as conversations with suggested replies, automated actions, and a persistent knowledge base.

## Architecture

```text
WhatsApp ←→ Mautrix Bridge ←→ Dendrite (Matrix) ←→ Listener → Convex ←→ Dashboard
                                                                 ↕
                                                            AI Agents
```

| Component | Description |
|---|---|
| **Dendrite** | Self-hosted Matrix homeserver — the event backbone |
| **Mautrix WhatsApp** | WhatsApp ↔ Matrix bridge |
| **Convex** | Self-hosted real-time backend (database, functions, agents) |
| **Listener** | Node.js service that syncs Matrix events → Convex |
| **Dashboard** | Vite + React SPA for managing conversations, contacts, and AI |
| **AI Agents** | Chatter (reply suggestions) + Artifactor (knowledge base) |

## Project Structure

```text
├── apps/
│   ├── dashboard/       # Vite React SPA (dev port 5174)
│   ├── listener/        # Matrix → Convex sync service (Docker)
│   └── e2e/             # Playwright end-to-end tests
├── packages/
│   ├── api/             # Convex backend — schema, functions, agents
│   ├── ui/              # Shared UI components + Storybook
│   └── config/          # Shared TypeScript & Tailwind config
├── docker/
│   ├── docker-compose.yml
│   ├── assistline-init/  # Unified init container (setup + deploy + seed)
│   ├── dendrite.yaml     # Matrix homeserver config
│   └── mautrix-data/     # WhatsApp bridge config & registration
└── docs/
    ├── changelog.md
    └── glossary.md
```

## Getting Started

### Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 10 — `npm install -g pnpm`
- **Docker & Docker Compose** — [Install Docker](https://docs.docker.com/get-docker/)

### Quick Start

```bash
# 1. Clone and install
git clone <repository-url>
cd assistline
pnpm install

# 2. Generate environment files and secrets
pnpm setup:envs

# 3. Start all services (Dendrite, Convex, bridges, init)
docker compose -f docker/docker-compose.yml up -d

# 4. Start the dashboard dev server
pnpm dev
```

That's it. The `assistline-init` container automatically:
- Creates the Matrix bot user on Dendrite
- Deploys all Convex functions and schema
- Seeds default config entries and roles

Once running:
- **Dashboard:** http://localhost:5174
- **Convex Inspector:** http://localhost:6791 (run `pnpm convex:key` for the admin key)

### Connecting WhatsApp

1. Open the Dashboard → **Channels** → **Add Channel** → **WhatsApp**
2. Click **Connect** — a QR code will appear
3. Scan the QR code with WhatsApp on your phone
4. Messages will start flowing into the dashboard

## Development Workflows

| Command | Description |
|---|---|
| `pnpm dev` | Start the dashboard dev server |
| `pnpm convex:push` | Deploy Convex functions to the self-hosted backend |
| `pnpm listener:rebuild` | Rebuild and restart the Matrix listener container |
| `pnpm deploy` | Full deploy — Convex push + listener rebuild |
| `pnpm update` | After `git pull` — installs deps + deploys everything |
| `pnpm storybook` | Launch Storybook for UI components |
| `pnpm format` | Format code with Biome |
| `pnpm lint` | Lint code with Biome |
| `pnpm --filter e2e test` | Run Playwright E2E tests |

### When to deploy what

- **Changed Convex functions** (`packages/api/convex/`) → `pnpm convex:push`
- **Changed listener code** (`apps/listener/`) → `pnpm listener:rebuild`
- **Changed both** → `pnpm deploy`
- **Restarted Docker** → Just `docker compose up -d` — the init container re-deploys automatically

### After `git pull`

```bash
git pull
pnpm update
```

This installs any new dependencies and deploys all changes (Convex functions + listener) in one command.

## Environment Variables

Run `pnpm setup:envs` to auto-generate all secrets. The script:
1. Copies `.env.example` → `.env.local` with random passwords
2. Updates `docker/dendrite.yaml` with the shared secret
3. Creates `docker/.env` for Docker Compose

| Variable | Purpose |
|---|---|
| `DENDRITE_SERVER_NAME` | Matrix server domain (default: `matrix.local`) |
| `DENDRITE_SHARED_SECRET` | Shared secret for bot user registration |
| `MATRIX_BOT_USERNAME` | Bot user for the listener (default: `listener-bot`) |
| `MATRIX_BOT_PASSWORD` | Bot password (auto-generated) |
| `VITE_CONVEX_URL` | Convex backend URL for the dashboard |
| `TS_AUTHKEY` | Optional Tailscale auth key for remote access |
| `ASSISTLINE_DATA` | Root data directory (default: `./assistline-data`) |

### Data & Backups

All persistent data lives under a single directory (`ASSISTLINE_DATA`):

```text
assistline-data/
├── convex/              # Convex SQLite DB + credentials (most critical)
├── dendrite/            # Matrix homeserver state
├── mautrix-whatsapp/    # WhatsApp bridge config + session
├── listener/            # Sync token
└── tailscale/           # VPN state
```

To point data at an external drive or NAS:

```bash
# In .env.local (or docker/.env)
ASSISTLINE_DATA="/mnt/nas/assistline"
```

## Tech Stack

- **Runtime:** [Node.js](https://nodejs.org/) · [pnpm](https://pnpm.io/) · [Turborepo](https://turbo.build/)
- **Backend:** [Convex](https://convex.dev/) (self-hosted) · [Convex Agent Component](https://www.npmjs.com/package/@convex-dev/agent)
- **Frontend:** [Vite](https://vite.dev/) · [React](https://react.dev/) · [Tailwind CSS v4](https://tailwindcss.com/)
- **UI:** [shadcn/ui](https://ui.shadcn.com/) · [Base UI](https://base-ui.com/)
- **Messaging:** [Dendrite](https://matrix-org.github.io/dendrite/) · [Mautrix WhatsApp](https://docs.mau.fi/bridges/go/whatsapp/)
- **AI:** [Vercel AI SDK](https://sdk.vercel.ai/) · OpenAI · Anthropic · Google AI
- **Testing:** [Playwright](https://playwright.dev/) · [Vitest](https://vitest.dev/)
- **Toolchain:** [Biome](https://biomejs.dev/)

## Contributing

Before contributing, read [AGENTS.md](./AGENTS.md) for standards on:
- Conventional Commits
- TypeScript (no `any`)
- Tailwind v4 + shadcn/ui + Base UI (no Radix)
- Testing requirements
- Deployment workflows
