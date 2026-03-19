import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a crypto-random alphanumeric string. */
function randomSecret(length = 32) {
  return randomBytes(length).toString("hex").slice(0, length);
}

/** Generate a random password (readable, 16 chars). */
function randomPassword(length = 16) {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(length);
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join("");
}

// ---------------------------------------------------------------------------
// Replacement map — every GENERATE_ME placeholder gets a random value
// ---------------------------------------------------------------------------

const replacements = {
  DENDRITE_SHARED_SECRET: randomSecret(48),
  MATRIX_BOT_PASSWORD: randomPassword(),
};

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

/**
 * Walk directories looking for .env.example files.
 * For each one, generate a .env.local with GENERATE_ME placeholders replaced
 * by random values.
 */
function setupEnvs(dir) {
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);

    if (item.isDirectory()) {
      if (
        ["node_modules", ".git", ".turbo", ".next", "dist"].includes(item.name)
      ) {
        continue;
      }
      setupEnvs(fullPath);
      continue;
    }

    if (item.name !== ".env.example") continue;

    const targetPath = path.join(dir, ".env.local");
    const relDir = path.relative(rootDir, dir) || ".";

    if (fs.existsSync(targetPath)) {
      console.log(`  ⏩ .env.local already exists in ${relDir}`);
      continue;
    }

    let content = fs.readFileSync(fullPath, "utf-8");

    // Replace GENERATE_ME placeholders with random values
    let generated = false;
    for (const [key, value] of Object.entries(replacements)) {
      const pattern = new RegExp(`(${key}=)"GENERATE_ME"`, "g");
      if (pattern.test(content)) {
        content = content.replace(pattern, `$1"${value}"`);
        generated = true;
      }
    }

    fs.writeFileSync(targetPath, content);
    console.log(`  ✅ Created .env.local in ${relDir}`);
    if (generated) {
      console.log(`     └─ Generated random credentials`);
    }
  }
}

/**
 * Update dendrite.yaml with the generated shared secret.
 * This allows the bot and admin user creation on Dendrite.
 */
function updateDendriteConfig() {
  const configPath = path.join(rootDir, "docker", "dendrite.yaml");

  if (!fs.existsSync(configPath)) {
    console.log(
      "  ⚠️  docker/dendrite.yaml not found — skipping Dendrite config update",
    );
    return;
  }

  let content = fs.readFileSync(configPath, "utf-8");
  const secret = replacements.DENDRITE_SHARED_SECRET;

  // Replace the shared secret line (handles both empty and existing values)
  content = content.replace(
    /registration_shared_secret:\s*"[^"]*"/,
    `registration_shared_secret: "${secret}"`,
  );

  fs.writeFileSync(configPath, content);
  console.log("  ✅ Updated docker/dendrite.yaml with shared secret");
}

/**
 * Create docker/.env that docker-compose reads automatically.
 * We symlink to the root .env.local so there's a single source of truth.
 */
function linkDockerEnv() {
  const rootEnvLocal = path.join(rootDir, ".env.local");
  const dockerEnv = path.join(rootDir, "docker", ".env");

  if (!fs.existsSync(rootEnvLocal)) {
    console.log("  ⚠️  Root .env.local not found — skipping docker/.env");
    return;
  }

  // Copy instead of symlink (more portable for Docker on all OSes)
  fs.copyFileSync(rootEnvLocal, dockerEnv);
  console.log("  ✅ Created docker/.env (for docker-compose)");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log("");
console.log("╔══════════════════════════════════════════════╗");
console.log("║  Assistline Setup                            ║");
console.log("╚══════════════════════════════════════════════╝");
console.log("");

console.log("→ Setting up environment files…");
try {
  setupEnvs(rootDir);
  updateDendriteConfig();
  linkDockerEnv();

  console.log("");
  console.log("→ Generated credentials:");
  console.log(`  Matrix Bot     : ${replacements.MATRIX_BOT_PASSWORD}`);
  console.log(
    `  Shared Secret  : ${replacements.DENDRITE_SHARED_SECRET.slice(0, 12)}…`,
  );

  console.log("");
  console.log("✨ Setup complete! Next steps:");
  console.log("   1. docker compose -f docker/docker-compose.yml up -d");
  console.log("   2. Open http://localhost:5174 for the dashboard");
  console.log("   3. Open http://localhost:6791 for the Convex inspector");
  console.log("      └─ Run `pnpm convex:key` to get the admin key");
  console.log("");
} catch (error) {
  console.error("❌ Error during setup:", error);
  process.exit(1);
}
