# ------------------------------------------------------------------
# assistline-init
#
# Unified init container that runs once on `docker compose up`:
#   Phase 1: Matrix bot user setup (create user, save access token)
#   Phase 2: Convex function deployment (generate admin key, deploy)
#
# Source code (packages/api, packages/config) is volume-mounted at
# runtime so this container always deploys the latest code from disk.
# ------------------------------------------------------------------

# Copy the generate_key binary from the official Convex backend image
FROM ghcr.io/get-convex/convex-backend:latest AS convex-tools

# Use Ubuntu 24.04 to match the GLIBC version the generate_key binary expects
FROM ubuntu:24.04

# Install Node.js 20, curl, wget, and pnpm
RUN apt-get update && \
    apt-get install -y curl wget ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g corepack && \
    corepack enable && corepack prepare pnpm@10.28.1 --activate && \
    rm -rf /var/lib/apt/lists/*

# Copy the generate_key binary from the Convex image
COPY --from=convex-tools /convex/generate_key /usr/local/bin/generate_key
RUN chmod +x /usr/local/bin/generate_key

WORKDIR /app

# Copy workspace root manifests (needed for pnpm install)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy package manifests from workspace packages for dependency resolution.
# The actual source code is volume-mounted at runtime; we only need
# the package.json files here so pnpm can install node_modules.
COPY packages/api/package.json packages/api/
COPY packages/config/package.json packages/config/

# Install all dependencies at build time
RUN pnpm install --frozen-lockfile

# Copy the init script
COPY docker/assistline-init/init.sh /init.sh
RUN chmod +x /init.sh

CMD ["/init.sh"]
