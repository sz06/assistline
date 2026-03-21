#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# init.sh — Unified init script for AssistLine.
#
# Runs inside the assistline-init container on every `docker compose up`.
# All three phases are idempotent and safe to re-run.
#
#   Phase 1: Matrix Setup   — create bot user, save access token
#   Phase 2: Convex Deploy  — generate admin key, deploy functions
#   Phase 3: Seed Data      — populate config entries and default roles
# ---------------------------------------------------------------------------
set -euo pipefail

MAX_RETRIES=30
RETRY_INTERVAL=2

echo "╔══════════════════════════════════════════════╗"
echo "║  AssistLine Init                             ║"
echo "╚══════════════════════════════════════════════╝"

# ═══════════════════════════════════════════════════════════════════
# PHASE 1: Matrix Bot Setup
# ═══════════════════════════════════════════════════════════════════

HOMESERVER="${MATRIX_HOMESERVER_URL:-http://dendrite:8008}"
SERVER_NAME="${DENDRITE_SERVER_NAME:-matrix.local}"
BOT_USER="${MATRIX_BOT_USERNAME:-listener-bot}"
BOT_PASS="${MATRIX_BOT_PASSWORD}"
TOKEN_FILE="/shared-matrix/bot-access-token"

echo ""
echo "┌──────────────────────────────────────────────┐"
echo "│  Phase 1: Matrix Bot Setup                   │"
echo "└──────────────────────────────────────────────┘"
echo ""
echo "  Homeserver: ${HOMESERVER}"
echo ""

# ── Wait for Dendrite ─────────────────────────────────────────────
echo "→ Waiting for Dendrite…"
for i in $(seq 1 "$MAX_RETRIES"); do
  if wget -q -O /dev/null "${HOMESERVER}/_matrix/client/versions" 2>/dev/null; then
    echo "  ✓ Dendrite is reachable (attempt ${i}/${MAX_RETRIES})"
    break
  fi
  if [ "$i" -eq "$MAX_RETRIES" ]; then
    echo "  ✗ Dendrite not reachable after ${MAX_RETRIES} attempts. Exiting."
    exit 1
  fi
  echo "  … waiting (attempt ${i}/${MAX_RETRIES})"
  sleep "$RETRY_INTERVAL"
done

# ── Register bot user ────────────────────────────────────────────
echo ""
echo "→ Registering @${BOT_USER}:${SERVER_NAME}…"

NONCE=$(wget -q -O - "${HOMESERVER}/_matrix/client/v3/register" \
  --header="Content-Type: application/json" \
  --post-data='{"username":"'"${BOT_USER}"'","password":"'"${BOT_PASS}"'","auth":{"type":"m.login.dummy"},"inhibit_login":true}' 2>&1 || true)

if echo "$NONCE" | grep -q "M_USER_IN_USE"; then
  echo "  ⏩ User @${BOT_USER}:${SERVER_NAME} already exists"
elif echo "$NONCE" | grep -q "user_id"; then
  echo "  ✓ User @${BOT_USER}:${SERVER_NAME} created"
else
  echo "  ⚠ Registration response: $(echo "$NONCE" | head -1)"
fi

# ── Login and save access token ──────────────────────────────────
echo ""
echo "→ Logging in as @${BOT_USER}:${SERVER_NAME}…"

RESPONSE=$(wget -q -O - "${HOMESERVER}/_matrix/client/v3/login" \
  --header="Content-Type: application/json" \
  --post-data='{"type":"m.login.password","identifier":{"type":"m.id.user","user":"'"${BOT_USER}"'"},"password":"'"${BOT_PASS}"'"}' 2>&1)

ACCESS_TOKEN=$(echo "$RESPONSE" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')

if [ -n "$ACCESS_TOKEN" ]; then
  mkdir -p "$(dirname "$TOKEN_FILE")"
  echo "$ACCESS_TOKEN" > "$TOKEN_FILE"
  echo "  ✓ Bot access token saved to ${TOKEN_FILE}"
else
  echo "  ✗ Failed to get access token"
  exit 1
fi

echo ""
echo "  ✓ Phase 1 complete — Matrix bot is ready"

# ═══════════════════════════════════════════════════════════════════
# PHASE 2: Convex Function Deployment
# ═══════════════════════════════════════════════════════════════════

CONVEX_URL="${CONVEX_BACKEND_URL:-http://convex:3210}"
CREDENTIALS_PATH="${CREDENTIALS_PATH:-/convex-credentials}"

echo ""
echo "┌──────────────────────────────────────────────┐"
echo "│  Phase 2: Convex Function Deployment         │"
echo "└──────────────────────────────────────────────┘"
echo ""
echo "  Backend URL: ${CONVEX_URL}"
echo ""

# ── Wait for Convex backend ──────────────────────────────────────
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

# ── Read instance credentials ────────────────────────────────────
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

# ── Generate admin key ───────────────────────────────────────────
echo ""
echo "→ Generating admin key…"

ADMIN_KEY=$(generate_key "$INSTANCE_NAME" "$INSTANCE_SECRET")
echo "  ✓ Admin key generated"

# ── Deploy functions ─────────────────────────────────────────────
echo ""
echo "→ Deploying Convex functions…"
echo ""

cd /app/packages/api

export CONVEX_SELF_HOSTED_URL="${CONVEX_URL}"
export CONVEX_SELF_HOSTED_ADMIN_KEY="${ADMIN_KEY}"

# Remove any .env.local that may conflict with self-hosted config
rm -f .env.local
unset CONVEX_DEPLOYMENT 2>/dev/null || true

npx convex deploy --cmd 'echo "  ✓ Type generation complete"'

# ── Save admin key for other services ────────────────────────────
mkdir -p /shared-convex
echo "$ADMIN_KEY" > /shared-convex/convex-admin-key
echo ""
echo "  ✓ Admin key saved to /shared-convex/convex-admin-key"

echo ""
echo "  ✓ Phase 2 complete — Convex functions deployed"

# ═══════════════════════════════════════════════════════════════════
# PHASE 3: Seed Data
# ═══════════════════════════════════════════════════════════════════

echo ""
echo "┌──────────────────────────────────────────────┐"
echo "│  Phase 3: Seed Data                          │"
echo "└──────────────────────────────────────────────┘"
echo ""
echo "→ Seeding config and roles…"

SEED_RESPONSE=$(curl -sf "${CONVEX_URL}/api/mutation" \
  -H "Content-Type: application/json" \
  -H "Authorization: Convex ${ADMIN_KEY}" \
  -d '{"path": "init:seedData", "args": {}, "format": "json"}' 2>&1) || true

if echo "$SEED_RESPONSE" | grep -q "Seeding complete"; then
  SEED_RESULT=$(echo "$SEED_RESPONSE" | sed -n 's/.*"value":"\([^"]*\)".*/\1/p')
  echo "  ✓ ${SEED_RESULT}"
elif echo "$SEED_RESPONSE" | grep -q "status.*\"success\""; then
  echo "  ✓ Seed data applied"
else
  echo "  ⚠ Seed response: ${SEED_RESPONSE}"
  echo "    (This is non-fatal — you can seed manually from the Convex dashboard)"
fi

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  ✓ AssistLine init complete!                 ║"
echo "╚══════════════════════════════════════════════╝"

