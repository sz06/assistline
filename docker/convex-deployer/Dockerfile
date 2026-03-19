# ------------------------------------------------------------------
# Convex Auto-Deployer
#
# Init container that deploys Convex functions to the self-hosted
# backend. Runs once on `docker compose up`, then exits.
# ------------------------------------------------------------------

# Copy the generate_key binary from the official Convex backend image
FROM ghcr.io/get-convex/convex-backend:latest AS convex-tools

# Use Ubuntu 24.04 to match the GLIBC version the generate_key binary expects
FROM ubuntu:24.04

# Install Node.js 20, curl, and pnpm
RUN apt-get update && \
    apt-get install -y curl ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g corepack && \
    corepack enable && corepack prepare pnpm@10.28.1 --activate && \
    rm -rf /var/lib/apt/lists/*

# Copy the generate_key binary from the Convex image
COPY --from=convex-tools /convex/generate_key /usr/local/bin/generate_key
RUN chmod +x /usr/local/bin/generate_key

WORKDIR /app

# Copy workspace root manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy the API package (contains all Convex functions and schema)
COPY packages/api/ packages/api/
COPY packages/config/ packages/config/

# Install dependencies (only needs convex CLI)
RUN pnpm install --frozen-lockfile

# Copy the deploy script
COPY docker/convex-deployer/deploy.sh /deploy.sh
RUN chmod +x /deploy.sh

CMD ["/deploy.sh"]
