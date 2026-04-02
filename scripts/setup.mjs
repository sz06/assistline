import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const dockerDir = path.join(rootDir, "docker");

/** Resolve the data directory — reads ASSISTLINE_DATA from .env.local if set. */
function resolveDataDir() {
  const envLocalPath = path.join(rootDir, ".env.local");
  if (fs.existsSync(envLocalPath)) {
    const envContent = fs.readFileSync(envLocalPath, "utf-8");
    const match = envContent.match(/^ASSISTLINE_DATA=["']?([^"'\n]+)["']?$/m);
    if (match?.[1]) {
      const raw = match[1].trim();
      // Resolve relative to docker/ (same as docker-compose.yml)
      return path.isAbsolute(raw) ? raw : path.resolve(dockerDir, raw);
    }
  }
  return path.join(dockerDir, "assistline-data");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a crypto-random hex string. */
function randomSecret(length = 32) {
  return randomBytes(length).toString("hex").slice(0, length);
}

/** Generate a crypto-random alphanumeric password. */
function randomPassword(length = 16) {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(length);
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join("");
}

/** Generate a crypto-random Base64-like string (for bridge tokens). */
function randomToken(length = 64) {
  return randomBytes(length).toString("base64url").slice(0, length);
}

// ---------------------------------------------------------------------------
// Generated values — consistent across all config files
// ---------------------------------------------------------------------------

const secrets = {
  DENDRITE_SHARED_SECRET: randomSecret(48),
  MATRIX_ADMIN_PASSWORD: randomPassword(),
  MATRIX_BOT_PASSWORD: randomPassword(),
  WHATSAPP_PROVISION_SECRET: randomToken(64),
  META_PROVISION_SECRET: randomToken(64),
};

/** Bridge registration tokens (must match between config.yaml and registration.yaml) */
const bridges = {
  whatsapp: {
    asToken: randomToken(64),
    hsToken: randomToken(64),
    senderLocalpart: randomToken(16),
  },
  meta: {
    asToken: randomToken(64),
    hsToken: randomToken(64),
    senderLocalpart: randomToken(16),
  },
};

// ---------------------------------------------------------------------------
// 1. Generate .env.local files
// ---------------------------------------------------------------------------

function setupEnvFiles() {
  const examplePath = path.join(rootDir, ".env.example");
  const targetPath = path.join(rootDir, ".env.local");

  if (fs.existsSync(targetPath)) {
    console.log("  ⏩ .env.local already exists — skipping");
    return;
  }

  let content = fs.readFileSync(examplePath, "utf-8");

  // Replace all GENERATE_ME placeholders with generated values
  for (const [key, value] of Object.entries(secrets)) {
    const pattern = new RegExp(`(${key}=)"GENERATE_ME"`, "g");
    content = content.replace(pattern, `$1"${value}"`);
  }

  fs.writeFileSync(targetPath, content);
  console.log("  ✅ Created .env.local");
}

function setupDashboardEnv() {
  const targetPath = path.join(rootDir, "apps", "dashboard", ".env.local");

  if (fs.existsSync(targetPath)) {
    console.log("  ⏩ apps/dashboard/.env.local already exists — skipping");
    return;
  }

  fs.writeFileSync(
    targetPath,
    'VITE_CONVEX_URL=http://127.0.0.1:3210\n',
  );
  console.log("  ✅ Created apps/dashboard/.env.local");
}

function linkDockerEnv() {
  const rootEnvLocal = path.join(rootDir, ".env.local");
  const dockerEnv = path.join(dockerDir, ".env");

  if (!fs.existsSync(rootEnvLocal)) {
    console.log("  ⚠️  Root .env.local not found — skipping docker/.env");
    return;
  }

  fs.copyFileSync(rootEnvLocal, dockerEnv);
  console.log("  ✅ Created docker/.env (copy of root .env.local)");
}

// ---------------------------------------------------------------------------
// 2. Generate docker/dendrite.yaml from template
// ---------------------------------------------------------------------------

function setupDendriteConfig() {
  const templatePath = path.join(dockerDir, "dendrite.yaml.template");
  const configPath = path.join(dockerDir, "dendrite.yaml");

  if (fs.existsSync(configPath)) {
    console.log("  ⏩ docker/dendrite.yaml already exists — skipping");
    return;
  }

  if (!fs.existsSync(templatePath)) {
    console.log(
      "  ⚠️  docker/dendrite.yaml.template not found — cannot generate Dendrite config",
    );
    return;
  }

  let content = fs.readFileSync(templatePath, "utf-8");
  content = content.replace(/__DENDRITE_SHARED_SECRET__/g, secrets.DENDRITE_SHARED_SECRET);
  fs.writeFileSync(configPath, content);
  console.log("  ✅ Created docker/dendrite.yaml");
}

// ---------------------------------------------------------------------------
// 3. Generate mautrix bridge configs + registration files
// ---------------------------------------------------------------------------

function setupBridgeConfigs() {
  setupWhatsAppBridge();
  setupMetaBridge();
}

function setupWhatsAppBridge() {
  const dataDir = path.join(resolveDataDir(), "mautrix-whatsapp");
  const configPath = path.join(dataDir, "config.yaml");
  const regPath = path.join(dataDir, "registration.yaml");

  if (fs.existsSync(configPath) && fs.existsSync(regPath)) {
    console.log("  ⏩ mautrix-whatsapp config already exists — skipping");
    return;
  }

  fs.mkdirSync(dataDir, { recursive: true });

  const b = bridges.whatsapp;

  // Minimal config — the bridge fills in defaults for everything else
  const config = `# Auto-generated by pnpm setup — do not edit directly.
# The bridge will merge its built-in defaults for any missing fields.

network:
    os_name: Mautrix-WhatsApp bridge
    browser_name: unknown
    displayname_template: '{{or .BusinessName .PushName .Phone "Unknown user"}} (WA)'
    call_start_notices: true
    identity_change_notices: false
    send_presence_on_typing: false
    enable_status_broadcast: true
    disable_status_broadcast_send: true
    mute_status_broadcast: true
    force_active_delivery_receipts: false
    direct_media_auto_request: true
    initial_auto_reconnect: true
    animated_sticker:
        target: webp
        args:
            width: 320
            height: 320
            fps: 25
    history_sync:
        max_initial_conversations: -1
        request_full_sync: false

bridge:
    personal_filtering_spaces: true
    private_chat_portal_meta: true
    permissions:
        "*": relay
        "matrix.local": user
        "@admin:matrix.local": admin

database:
    type: sqlite3-fk-wal
    uri: file:/data/mautrix.db?_txlock=immediate

homeserver:
    address: http://dendrite:8008
    domain: matrix.local
    software: standard

appservice:
    address: http://mautrix-whatsapp:29318
    hostname: 0.0.0.0
    port: 29318
    id: whatsapp
    bot:
        username: whatsappbot
        displayname: WhatsApp bridge bot
    ephemeral_events: true
    as_token: "${b.asToken}"
    hs_token: "${b.hsToken}"
    username_template: whatsapp_{{.}}

matrix:
    message_status_events: false
    delivery_receipts: false
    message_error_notices: true
    sync_direct_chat_list: true
    federate_rooms: true

provisioning:
    shared_secret: ${secrets.WHATSAPP_PROVISION_SECRET}
    allow_matrix_auth: true

logging:
    min_level: info
    writers:
        - type: stdout
          format: pretty-colored
`;

  const registration = `id: whatsapp
url: http://mautrix-whatsapp:29318
as_token: ${b.asToken}
hs_token: ${b.hsToken}
sender_localpart: ${b.senderLocalpart}
rate_limited: false
namespaces:
    users:
        - regex: ^@whatsappbot:matrix\\.local$
          exclusive: true
        - regex: ^@whatsapp_.*:matrix\\.local$
          exclusive: true
de.sorunome.msc2409.push_ephemeral: true
receive_ephemeral: true
`;

  fs.writeFileSync(configPath, config);
  fs.writeFileSync(regPath, registration);
  console.log("  ✅ Created mautrix-whatsapp config + registration");
}

function setupMetaBridge() {
  const dataDir = path.join(resolveDataDir(), "mautrix-meta");
  const configPath = path.join(dataDir, "config.yaml");
  const regPath = path.join(dataDir, "registration.yaml");

  if (fs.existsSync(configPath) && fs.existsSync(regPath)) {
    console.log("  ⏩ mautrix-meta config already exists — skipping");
    return;
  }

  fs.mkdirSync(dataDir, { recursive: true });

  const b = bridges.meta;

  // Minimal config — the bridge fills in defaults for everything else
  const config = `# Auto-generated by pnpm setup — do not edit directly.
# The bridge will merge its built-in defaults for any missing fields.

network:
    mode: messenger
    displayname_template: '{{or .DisplayName .Username "Unknown user"}}'
    send_presence_on_typing: false
    disable_xma_backfill: true
    force_refresh_interval_seconds: 72000

bridge:
    command_prefix: "!meta"
    personal_filtering_spaces: true
    private_chat_portal_meta: true
    permissions:
        "*": relay
        "matrix.local": user
        "@admin:matrix.local": admin

database:
    type: sqlite3-fk-wal
    uri: file:/data/mautrix.db?_txlock=immediate

homeserver:
    address: http://dendrite:8008
    domain: matrix.local
    software: standard

appservice:
    address: http://mautrix-meta:29319
    hostname: 0.0.0.0
    port: 29319
    id: meta
    bot:
        username: metabot
        displayname: Meta bridge bot
    ephemeral_events: true
    as_token: "${b.asToken}"
    hs_token: "${b.hsToken}"
    username_template: meta_{{.}}

matrix:
    message_status_events: false
    delivery_receipts: false
    message_error_notices: true
    sync_direct_chat_list: true
    federate_rooms: true

provisioning:
    shared_secret: ${secrets.META_PROVISION_SECRET}
    allow_matrix_auth: true

logging:
    min_level: info
    writers:
        - type: stdout
          format: pretty-colored
`;

  const registration = `id: meta
url: http://mautrix-meta:29319
as_token: ${b.asToken}
hs_token: ${b.hsToken}
sender_localpart: ${b.senderLocalpart}
rate_limited: false
namespaces:
    users:
        - regex: ^@metabot:matrix\\.local$
          exclusive: true
        - regex: ^@meta_.*:matrix\\.local$
          exclusive: true
de.sorunome.msc2409.push_ephemeral: true
receive_ephemeral: true
`;

  fs.writeFileSync(configPath, config);
  fs.writeFileSync(regPath, registration);
  console.log("  ✅ Created mautrix-meta config + registration");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log("");
console.log("╔══════════════════════════════════════════════╗");
console.log("║  Assistline Setup                            ║");
console.log("╚══════════════════════════════════════════════╝");
console.log("");

try {
  console.log("→ Setting up environment files…");
  setupEnvFiles();
  setupDashboardEnv();
  linkDockerEnv();

  console.log("");
  console.log("→ Setting up Dendrite config…");
  setupDendriteConfig();

  console.log("");
  console.log("→ Setting up mautrix bridge configs…");
  setupBridgeConfigs();

  console.log("");
  console.log("→ Generated credentials:");
  console.log(`  Matrix Admin   : ${secrets.MATRIX_ADMIN_PASSWORD}`);
  console.log(`  Matrix Bot     : ${secrets.MATRIX_BOT_PASSWORD}`);
  console.log(
    `  Shared Secret  : ${secrets.DENDRITE_SHARED_SECRET.slice(0, 12)}…`,
  );
  console.log(
    `  WA Provision   : ${secrets.WHATSAPP_PROVISION_SECRET.slice(0, 12)}…`,
  );
  console.log(
    `  Meta Provision : ${secrets.META_PROVISION_SECRET.slice(0, 12)}…`,
  );

  console.log("");
  console.log("✨ Setup complete! Next steps:");
  console.log("   1. docker compose -f docker/docker-compose.yml up -d");
  console.log("   2. pnpm dev");
  console.log("   3. Open http://localhost:5174 for the dashboard");
  console.log("   4. Dashboard → AI Providers → Add your AI provider (OpenAI, Anthropic, etc.)");
  console.log("   5. Dashboard → Channels → Connect WhatsApp / Messenger / Instagram");
  console.log("");
  console.log("   Convex Inspector: http://localhost:6791");
  console.log("   └─ Run `pnpm convex:key` to get the admin key");
  console.log("");
} catch (error) {
  console.error("❌ Error during setup:", error);
  process.exit(1);
}
