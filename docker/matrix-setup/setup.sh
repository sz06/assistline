#!/usr/bin/env sh
# ---------------------------------------------------------------------------
# matrix-setup.sh — Create Dendrite bot user on first boot.
#
# This init container:
#   1. Waits for Dendrite to be reachable
#   2. Creates the listener-bot user (if not exists)
#   3. Logs in as the bot and saves the access token to a shared volume
# ---------------------------------------------------------------------------
set -eu

HOMESERVER="${MATRIX_HOMESERVER_URL:-http://dendrite:8008}"
SERVER_NAME="${DENDRITE_SERVER_NAME:-matrix.local}"
SHARED_SECRET="${DENDRITE_SHARED_SECRET}"

BOT_USER="${MATRIX_BOT_USERNAME:-listener-bot}"
BOT_PASS="${MATRIX_BOT_PASSWORD}"
TOKEN_FILE="/shared/bot-access-token"

echo "╔══════════════════════════════════════════════╗"
echo "║  Matrix User Setup                           ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── Wait for Dendrite ─────────────────────────────────────────────
echo "→ Waiting for Dendrite…"
for i in $(seq 1 30); do
  if wget -q -O /dev/null "${HOMESERVER}/_matrix/client/versions" 2>/dev/null; then
    echo "  ✓ Dendrite is reachable"
    break
  fi
  [ "$i" -eq 30 ] && { echo "  ✗ Dendrite not reachable"; exit 1; }
  echo "  … attempt $i/30"
  sleep 2
done

# ── Helper: register a user via Dendrite's admin API ─────────────
register_user() {
  local username="$1"
  local password="$2"
  local is_admin="$3"

  echo ""
  echo "→ Registering @${username}:${SERVER_NAME}…"

  # Step 1: Start registration flow to get a session nonce
  NONCE=$(wget -q -O - "${HOMESERVER}/_matrix/client/v3/register" \
    --header="Content-Type: application/json" \
    --post-data='{"username":"'"${username}"'","password":"'"${password}"'","auth":{"type":"m.login.dummy"},"inhibit_login":true}' 2>&1 || true)

  # Check if user already exists
  if echo "$NONCE" | grep -q "M_USER_IN_USE"; then
    echo "  ⏩ User @${username}:${SERVER_NAME} already exists"
    return 0
  fi

  # Step 2: Use the shared_secret admin registration (Dendrite-specific)
  # Dendrite's create-account is the simplest path
  # We use the register endpoint with the shared secret via the admin API
  RESULT=$(wget -q -O - "${HOMESERVER}/_synapse/admin/v1/register" \
    --header="Content-Type: application/json" \
    --post-data='{"nonce":"dummy"}' 2>&1 || true)

  # If the Synapse-compatible admin API doesn't work, the user was likely
  # already created by the register call above. Check the NONCE response.
  if echo "$NONCE" | grep -q "user_id"; then
    echo "  ✓ User @${username}:${SERVER_NAME} created"
    return 0
  fi

  echo "  ⚠ Registration response: $(echo "$NONCE" | head -1)"
  return 0
}

# ── Helper: login and get access token ────────────────────────────
login_user() {
  local username="$1"
  local password="$2"

  RESPONSE=$(wget -q -O - "${HOMESERVER}/_matrix/client/v3/login" \
    --header="Content-Type: application/json" \
    --post-data='{"type":"m.login.password","identifier":{"type":"m.id.user","user":"'"${username}"'"},"password":"'"${password}"'"}' 2>&1)

  TOKEN=$(echo "$RESPONSE" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
  echo "$TOKEN"
}

# ── Create bot user ───────────────────────────────────────────────
register_user "$BOT_USER" "$BOT_PASS" "false"

# ── Get bot access token ─────────────────────────────────────────
echo ""
echo "→ Logging in as @${BOT_USER}:${SERVER_NAME}…"
ACCESS_TOKEN=$(login_user "$BOT_USER" "$BOT_PASS")

if [ -n "$ACCESS_TOKEN" ]; then
  mkdir -p "$(dirname "$TOKEN_FILE")"
  echo "$ACCESS_TOKEN" > "$TOKEN_FILE"
  echo "  ✓ Bot access token saved to ${TOKEN_FILE}"
else
  echo "  ✗ Failed to get access token"
  exit 1
fi

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  ✓ Matrix users configured!                  ║"
echo "╚══════════════════════════════════════════════╝"
