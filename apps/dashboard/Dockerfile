# Base node image
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app
COPY . .

# Prune the workspace to just the dashboard app
RUN npx turbo prune dashboard --docker

FROM node:22-alpine AS builder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Install dependencies using the pruned lockfile
COPY --from=base /app/out/json/ .
COPY --from=base /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

# Build the project
COPY --from=base /app/out/full/ .
RUN pnpm turbo run build --filter=dashboard

# Production stage - Serve Vite static files
FROM node:22-alpine AS runner
WORKDIR /app
RUN npm install -g serve

# Copy out the built dashboard
COPY --from=builder /app/apps/dashboard/dist ./dist

# Provide fallback to index.html for React Router
CMD ["serve", "-s", "dist", "-l", "5173"]
