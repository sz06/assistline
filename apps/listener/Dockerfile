# ------------------------------------------------------------------
# Stage 1: Build
# ------------------------------------------------------------------
FROM node:20-slim AS builder

RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

WORKDIR /app

# Copy workspace root manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy only the packages needed by the listener
COPY packages/config/ packages/config/
COPY apps/listener/ apps/listener/

# Install dependencies (frozen lockfile for reproducibility)
RUN pnpm install --frozen-lockfile

# Build the listener TypeScript → JS
RUN pnpm --filter @repo/listener build

# ------------------------------------------------------------------
# Stage 2: Runtime
# ------------------------------------------------------------------
FROM node:20-slim

RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

WORKDIR /app

# Copy the full workspace structure needed at runtime
# (pnpm uses symlinks into node_modules/.pnpm — we need the full tree)
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=builder /app/node_modules/ node_modules/
COPY --from=builder /app/apps/listener/dist/ apps/listener/dist/
COPY --from=builder /app/apps/listener/package.json apps/listener/
COPY --from=builder /app/apps/listener/node_modules/ apps/listener/node_modules/

# Create data directory for sync-token persistence
RUN mkdir -p /app/data

ENV SYNC_TOKEN_PATH=/app/data/sync-token.json
ENV NODE_ENV=production

CMD ["node", "apps/listener/dist/index.js"]
