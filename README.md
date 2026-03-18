# Turbostack: Convex + Next.js + Vite + Clerk + Turborepo + Vercel

![Turbostack Banner](./docs/assets/banner.png)

A premium, production-ready monorepo template for building high-performance, type-safe full-stack applications. Includes a Next.js marketing site and a Vite-powered app ready for native deployment via Capacitor.

## ✨ Features

- 🏎️ **Turborepo** - High-performance build system for JavaScript/TypeScript monorepos.
- 🎨 **Modern UI** - **Tailwind CSS v4** with **shadcn/ui** and **Base UI** primitives. No Radix UI.
- 📱 **Cross-Platform** - Shared logic and components across **Next.js** (Marketing) and **Vite React** (App), with **Capacitor** for native deployments.
- ⚡ **Reactive Backend** - **Convex** for a 100% type-safe, real-time backend and database.
- 🔐 **Secure Auth** - **Clerk** integration for robust user management and authentication.
- 🛠️ **Unified Toolchain** - **Biome** for lightning-fast linting and formatting.
- 📈 **Insights** - **Vercel Analytics** integrated and ready for production.

## 🛠️ Tech Stack

- **Monorepo:** [Turborepo](https://turbo.build/)
- **Package Manager:** [pnpm](https://pnpm.io/)
- **Backend:** [Convex](https://convex.dev/)
- **Marketing (www):** [Next.js 16](https://nextjs.org/) (App Router)
- **App:** [Vite](https://vite.dev/) + [React](https://react.dev/) (SPA, Capacitor-ready)
- **Auth:** [Clerk](https://clerk.com/)
- **Toolchain:** [Biome](https://biomejs.dev/)
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/), [Base UI](https://base-ui.com/)
- **Analytics:** [Vercel Analytics](https://vercel.com/analytics)
- **Testing:** [Playwright](https://playwright.dev/) (E2E), [Vite](https://vitest.dev/) (Unit)

## 📁 Project Structure

```text
├── apps/
│   ├── www/          # Next.js marketing site & landing pages
│   ├── app/          # Vite React app (Capacitor-ready, runs on port 5173)
│   └── e2e/          # Playwright end-to-end tests
├── packages/
│   ├── api/          # Convex backend, schema, and shared business logic
│   ├── ui/           # Shared high-performance UI components
│   └── config/       # Shared TypeScript & Tailwind configurations
└── docs/             # Project documentation and changelogs
```

## 🚀 Getting Started

### Prerequisites

- Node.js (LTS)
- [pnpm](https://pnpm.io/installation) (`npm install -g pnpm`)
- [Docker & Docker Compose](https://docs.docker.com/get-docker/)

### Quick Start (Local Development)

1. **Clone the repo:**
   ```bash
   git clone <repository-url>
   cd turbostack
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Set up environment variables:**
   ```bash
   pnpm setup:envs
   ```
   *This copies all `.env.example` files to `.env.local` across the monorepo. You can optionally add a `TS_AUTHKEY` in the root `.env.local`.*

4. **Start the local backend services (Docker):**
   ```bash
   cd docker
   docker compose up -d
   cd ..
   ```
   *This spins up a local self-hosted Convex instance, Dendrite (Matrix), Mautrix-WhatsApp, and a Tailscale proxy.*

5. **Run the development environment:**
   ```bash
   # From the root
   pnpm dev
   ```
   *This starts the frontend applications along with local Convex dev mode, seamlessly connecting them to the Docker backend.*

## 🔐 Authentication Setup

To sync Clerk auth with your Convex backend:

1. **Clerk Dashboard:**
   - Go to **Configure** > **JWT Templates** > **New Template** > **Convex**.
   - This creates a template named `convex`.
   - Copy the **Issuer URL** (or use the **Frontend API URL** from API Keys).

2. **Convex Dashboard:**
   - Go to **Settings** > **Environment Variables**.
   - Add `CLERK_JWT_ISSUER_DOMAIN` and paste the URL.

*Note: Ensure you do this for both Production and Development environments in Clerk.*

## 🛠️ Development Workflows

- **Lint & Format:** `pnpm check` (powered by Biome)
- **Storybook:** `pnpm storybook` (visualize shared components)
- **Tests:** `pnpm --filter e2e test` (run Playwright tests)
- **Build:** `pnpm build` (optimized production build for all apps)

## 🚢 Deployment

### Vercel (Full Stack)

1. **Create Vercel Project:**
   - Go to [Vercel](https://vercel.com), create a new project, and import your repository.
   - Hit **Deploy**. The initial build will fail—this is expected as we haven't connected services yet.

2. **Connect Integrations:**
   - In your Vercel project, go to **Settings** > **Integrations**.
   - Install and connect **Clerk**.
   - Install and connect **Convex**. Vercel will automatically handle production environment variables.

3. **Configure Clerk Domains:**
   - In the **Clerk Dashboard**, go to **Configure** > **Domains**.
   - Complete the domain configuration for your Vercel URL, otherwise Vercel's production checks may fail.

4. **Add JWT Template:**
   - In **Clerk**, go to **JWT Templates** and add the **Convex** template for both `prod` and `dev`.

5. **Finalize Convex Prod Env:**
   - Go to the **Clerk Dashboard** > **API Keys** and copy the **Frontend API URL**.
   - In the **Convex Dashboard**, go to your production project > **Settings** > **Environment Variables**.
   - Add `CLERK_JWT_ISSUER_DOMAIN` with the value you copied.

6. **Redeploy:**
   - Go back to Vercel and trigger a redeploy. Your app should now be live and fully integrated!

## 🤝 Contributing

Before contributing, please read [AGENTS.md](./AGENTS.md) for our standards on:
- Conventional Commits
- Tailwind v4 & shadcn/ui patterns
- Mandatory Base UI usage (No Radix UI)
- Type safety and strict Biome checks

---

Built with ❤️ by [Cloudexible](https://cloudexible.com)
