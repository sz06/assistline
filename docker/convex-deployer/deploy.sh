#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# deploy.sh — Auto-deploy Convex functions to the self-hosted backend.
#
# This script runs inside the convex-deployer init container. It:
#   1. Waits for the Convex backend to be reachable
#   2. Reads instance credentials from the shared volume
#   3. Generates an admin key using the generate_key binary
#   4. Deploys all functions and schema via `npx convex deploy`
# ---------------------------------------------------------------------------
set -euo pipefail

CONVEX_URL="${CONVEX_BACKEND_URL:-http://convex:3210}"
CREDENTIALS_PATH="${CREDENTIALS_PATH:-/convex-credentials}"
MAX_RETRIES=30
RETRY_INTERVAL=2

echo "╔══════════════════════════════════════════════╗"
echo "║  Convex Auto-Deployer                        ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "  Backend URL: ${CONVEX_URL}"
echo ""

# ── Step 1: Wait for backend to be reachable ──────────────────────────────
echo "→ Waiting for Convex backend to be ready…"
for i in $(seq 1 "$MAX_RETRIES"); do
  if curl -sf "${CONVEX_URL}/version" > /dev/null 2>&1; then
    echo "  ✓ Backend is reachable (attempt ${i}/${MAX_RETRIES})"
    break
  fi
  if [ "$i" -eq "$MAX_RETRIES" ]; then
    echo "  ✗ Backend not reachable after ${MAX_RETRIES} attempts. Exiting."
    exit 1
  fi
  echo "  … waiting (attempt ${i}/${MAX_RETRIES})"
  sleep "$RETRY_INTERVAL"
done

# ── Step 2: Read instance credentials ─────────────────────────────────────
echo ""
echo "→ Reading instance credentials…"

if [ ! -f "${CREDENTIALS_PATH}/instance_name" ] || [ ! -f "${CREDENTIALS_PATH}/instance_secret" ]; then
  echo "  ✗ Credentials not found at ${CREDENTIALS_PATH}."
  echo "    Make sure the convex-data volume is shared."
  exit 1
fi

INSTANCE_NAME=$(cat "${CREDENTIALS_PATH}/instance_name")
INSTANCE_SECRET=$(cat "${CREDENTIALS_PATH}/instance_secret")
echo "  ✓ Instance: ${INSTANCE_NAME}"

# ── Step 3: Generate admin key ────────────────────────────────────────────
echo ""
echo "→ Generating admin key…"

ADMIN_KEY=$(generate_key "$INSTANCE_NAME" "$INSTANCE_SECRET")
echo "  ✓ Admin key generated"

# ── Step 4: Deploy functions ──────────────────────────────────────────────
echo ""
echo "→ Deploying Convex functions…"
echo ""

cd /app/packages/api

# Set the env vars that `npx convex deploy` needs
export CONVEX_SELF_HOSTED_URL="${CONVEX_URL}"
export CONVEX_SELF_HOSTED_ADMIN_KEY="${ADMIN_KEY}"

# Remove any .env.local that was copied from the repo — it may contain
# a CONVEX_DEPLOYMENT variable that conflicts with self-hosted config.
rm -f .env.local
unset CONVEX_DEPLOYMENT

npx convex deploy --cmd 'echo "  ✓ Type generation complete"'

# ── Step 5: Save admin key for dashboard access ───────────────────────────
mkdir -p /shared
echo "$ADMIN_KEY" > /shared/convex-admin-key
echo ""
echo "  ✓ Admin key saved to /shared/convex-admin-key"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  ✓ Convex functions deployed successfully!   ║"
echo "╚══════════════════════════════════════════════╝"
