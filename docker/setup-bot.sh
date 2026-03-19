#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# setup-bot.sh
#
# Creates a Matrix bot user on the Dendrite homeserver and retrieves an
# access token. Run this AFTER `docker compose up -d` has started the
# Dendrite container.
#
# Usage:
#   ./docker/setup-bot.sh [username] [password]
#
# Defaults:
#   username = listener-bot
#   password = (auto-generated)
# ---------------------------------------------------------------------------
set -euo pipefail

CONTAINER_NAME="dendrite"
USERNAME="${1:-listener-bot}"
PASSWORD="${2:-$(openssl rand -base64 16)}"
HOMESERVER_URL="http://localhost:8008"
SERVER_NAME="matrix.local"

echo "──────────────────────────────────────────────"
echo " Matrix Bot Setup"
echo "──────────────────────────────────────────────"
echo " Container : $CONTAINER_NAME"
echo " Username  : $USERNAME"
echo " Server    : $SERVER_NAME"
echo ""

# Step 1: Create the account on Dendrite
echo "→ Creating account @${USERNAME}:${SERVER_NAME} …"
docker exec -i "$CONTAINER_NAME" \
  /usr/bin/create-account \
  -config /etc/dendrite/dendrite.yaml \
  -username "$USERNAME" \
  -password "$PASSWORD" 2>&1 || true

echo ""

# Step 2: Login to get an access token
echo "→ Logging in to get access token …"
RESPONSE=$(curl -s -X POST "${HOMESERVER_URL}/_matrix/client/v3/login" \
  -H 'Content-Type: application/json' \
  -d "{
    \"type\": \"m.login.password\",
    \"identifier\": {
      \"type\": \"m.id.user\",
      \"user\": \"${USERNAME}\"
    },
    \"password\": \"${PASSWORD}\"
  }")

ACCESS_TOKEN=$(echo "$RESPONSE" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$ACCESS_TOKEN" ]; then
  echo "✗ Failed to obtain access token. Server response:"
  echo "$RESPONSE"
  exit 1
fi

echo ""
echo "──────────────────────────────────────────────"
echo " ✓ Bot user created successfully!"
echo "──────────────────────────────────────────────"
echo ""
echo " Add the following to your .env.local (or docker-compose environment):"
echo ""
echo "   MATRIX_BOT_USER_ID=\"@${USERNAME}:${SERVER_NAME}\""
echo "   MATRIX_BOT_ACCESS_TOKEN=\"${ACCESS_TOKEN}\""
echo ""
echo " Password (save if needed): ${PASSWORD}"
echo "──────────────────────────────────────────────"
