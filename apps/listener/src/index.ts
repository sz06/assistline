import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex.js";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { dirname } from "node:path";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return val;
}

const TOKEN_FILE = process.env.BOT_TOKEN_FILE ?? "/shared/bot-access-token";

/**
 * Read the bot access token — either from the shared file written by the
 * matrix-setup init container, or from an environment variable as fallback.
 */
function loadAccessToken(): string {
  if (existsSync(TOKEN_FILE)) {
    const token = readFileSync(TOKEN_FILE, "utf-8").trim();
    if (token) {
      console.log(`[listener] Access token loaded from ${TOKEN_FILE}`);
      return token;
    }
  }
  // Fallback to env var (manual setup)
  return requireEnv("MATRIX_BOT_ACCESS_TOKEN");
}

const MATRIX_HOMESERVER_URL = requireEnv("MATRIX_HOMESERVER_URL");
const CONVEX_URL = requireEnv("CONVEX_URL");

// Mutable access token — can be refreshed on 401
let currentAccessToken = loadAccessToken();

// Derive the full Matrix user ID from username + server name
const botUsername = process.env.MATRIX_BOT_USERNAME ?? "listener-bot";
const botPassword = process.env.MATRIX_BOT_PASSWORD ?? "";
const serverName = process.env.DENDRITE_SERVER_NAME ?? "matrix.local";
const MATRIX_BOT_USER_ID =
  process.env.MATRIX_BOT_USER_ID ?? `@${botUsername}:${serverName}`;

// Where to persist the sync token so we never miss messages on restart
const SYNC_TOKEN_PATH =
  process.env.SYNC_TOKEN_PATH ?? "./data/sync-token.json";

// How long to long-poll Dendrite (ms). 30s is the Matrix default.
const SYNC_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Convex client
// ---------------------------------------------------------------------------

const convex = new ConvexHttpClient(CONVEX_URL);

// ---------------------------------------------------------------------------
// Sync-token persistence
// ---------------------------------------------------------------------------

function loadSyncToken(): string | undefined {
  try {
    const data = JSON.parse(readFileSync(SYNC_TOKEN_PATH, "utf-8"));
    return data.since;
  } catch {
    return undefined;
  }
}

function saveSyncToken(since: string): void {
  mkdirSync(dirname(SYNC_TOKEN_PATH), { recursive: true });
  writeFileSync(SYNC_TOKEN_PATH, JSON.stringify({ since }));
}

function clearSyncToken(): void {
  try {
    if (existsSync(SYNC_TOKEN_PATH)) {
      unlinkSync(SYNC_TOKEN_PATH);
      console.log("[listener] Cleared stale sync token");
    }
  } catch {
    // Ignore — file may not exist
  }
}

// ---------------------------------------------------------------------------
// Matrix /sync and /join helpers
// ---------------------------------------------------------------------------

interface MatrixEvent {
  type: string;
  event_id: string;
  sender: string;
  origin_server_ts: number;
  content: {
    msgtype?: string;
    body?: string;
    membership?: string;
    [key: string]: unknown;
  };
}

interface SyncResponse {
  next_batch: string;
  rooms?: {
    join?: Record<
      string,
      {
        timeline?: {
          events?: MatrixEvent[];
        };
      }
    >;
    invite?: Record<string, unknown>;
  };
}

/** Custom error for Matrix 401 responses so we can handle re-auth. */
class MatrixUnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MatrixUnauthorizedError";
  }
}

async function matrixFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = `${MATRIX_HOMESERVER_URL}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${currentAccessToken}`,
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    },
  });
}

// ---------------------------------------------------------------------------
// Re-login logic
// ---------------------------------------------------------------------------

/**
 * Re-authenticate with the Matrix homeserver using username/password.
 * Updates `currentAccessToken` in memory and persists to the shared file.
 * Returns true on success, false on failure.
 */
async function reLogin(): Promise<boolean> {
  if (!botPassword) {
    console.error(
      "[listener] Cannot re-login: MATRIX_BOT_PASSWORD is not set",
    );
    return false;
  }

  console.log(
    `[listener] 🔑 Attempting re-login as @${botUsername}:${serverName}…`,
  );

  try {
    const res = await fetch(
      `${MATRIX_HOMESERVER_URL}/_matrix/client/v3/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "m.login.password",
          identifier: { type: "m.id.user", user: botUsername },
          password: botPassword,
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      console.error(`[listener] Re-login failed: ${res.status} ${body}`);
      return false;
    }

    const data = (await res.json()) as { access_token?: string };
    if (!data.access_token) {
      console.error("[listener] Re-login response missing access_token");
      return false;
    }

    currentAccessToken = data.access_token;

    // Persist the new token to the shared volume for future restarts
    try {
      mkdirSync(dirname(TOKEN_FILE), { recursive: true });
      writeFileSync(TOKEN_FILE, currentAccessToken);
      console.log(`[listener] ✓ New access token saved to ${TOKEN_FILE}`);
    } catch (writeErr) {
      console.warn(
        "[listener] ⚠ Could not save token file (read-only volume?), continuing with in-memory token",
      );
    }

    return true;
  } catch (err) {
    console.error(
      "[listener] Re-login error:",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

// ---------------------------------------------------------------------------
// Matrix API helpers
// ---------------------------------------------------------------------------

/** Auto-join a room the bot was invited to. */
async function joinRoom(roomId: string): Promise<void> {
  const res = await matrixFetch(
    `/_matrix/client/v3/join/${encodeURIComponent(roomId)}`,
    { method: "POST", body: "{}" },
  );
  if (res.ok) {
    console.log(`[listener] ✓ Joined room ${roomId}`);
  } else {
    const body = await res.text();
    console.error(`[listener] ✗ Failed to join ${roomId}: ${body}`);
  }
}

/** Call the Matrix /sync endpoint (long-polling). */
async function sync(since?: string): Promise<SyncResponse> {
  const params = new URLSearchParams({
    timeout: SYNC_TIMEOUT_MS.toString(),
    // Only fetch room timeline events — skip presence, account_data, etc.
    filter: JSON.stringify({
      presence: { types: [] },
      account_data: { types: [] },
      room: {
        state: { types: ["m.room.member"] },
        timeline: { types: ["m.room.message"] },
        ephemeral: { types: [] },
        account_data: { types: [] },
      },
    }),
  });
  if (since) params.set("since", since);

  const res = await matrixFetch(`/_matrix/client/v3/sync?${params}`);
  if (!res.ok) {
    const body = await res.text();
    // Surface 401 errors as a specific type so the caller can re-auth
    if (res.status === 401) {
      throw new MatrixUnauthorizedError(
        `Sync failed: ${res.status} ${body}`,
      );
    }
    throw new Error(`Sync failed: ${res.status} ${body}`);
  }
  return (await res.json()) as SyncResponse;
}

// ---------------------------------------------------------------------------
// Event handler
// ---------------------------------------------------------------------------

async function handleTimelineEvent(
  roomId: string,
  event: MatrixEvent,
): Promise<void> {
  // Only handle text messages
  if (event.type !== "m.room.message") return;
  if (event.content.msgtype !== "m.text") return;

  const body = event.content.body;
  if (!body) return;

  const direction: "in" | "out" =
    event.sender === MATRIX_BOT_USER_ID ? "out" : "in";

  try {
    const messageId = await convex.mutation(api.messages.insertMessage, {
      matrixRoomId: roomId,
      eventId: event.event_id,
      sender: event.sender,
      text: body,
      direction,
      timestamp: event.origin_server_ts,
    });

    console.log(
      `[listener] ${direction === "in" ? "⬇" : "⬆"} ${event.sender} → ${roomId} | eventId=${event.event_id} | convexId=${messageId}`,
    );
  } catch (err) {
    console.error(
      `[listener] Failed to ingest event ${event.event_id}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

// ---------------------------------------------------------------------------
// Main sync loop
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("[listener] Matrix Listener starting…");
  console.log(`[listener]   Homeserver : ${MATRIX_HOMESERVER_URL}`);
  console.log(`[listener]   Bot User   : ${MATRIX_BOT_USER_ID}`);
  console.log(`[listener]   Convex URL : ${CONVEX_URL}`);
  console.log(`[listener]   Token Path : ${SYNC_TOKEN_PATH}`);

  let since = loadSyncToken();
  if (since) {
    console.log(`[listener] Resuming from sync token: ${since.slice(0, 20)}…`);
  } else {
    console.log("[listener] No saved token — performing initial sync…");
  }

  // Infinite sync loop
  while (true) {
    try {
      const response = await sync(since);

      // Handle room invites — auto-join
      if (response.rooms?.invite) {
        for (const roomId of Object.keys(response.rooms.invite)) {
          console.log(`[listener] Invited to room ${roomId} — joining…`);
          await joinRoom(roomId);
        }
      }

      // Handle joined room timeline events
      if (response.rooms?.join) {
        for (const [roomId, room] of Object.entries(response.rooms.join)) {
          const events = room.timeline?.events ?? [];
          for (const event of events) {
            await handleTimelineEvent(roomId, event);
          }
        }
      }

      // Persist the sync token for crash-resilient restarts
      since = response.next_batch;
      saveSyncToken(since);
    } catch (err) {
      // ── Handle expired/invalid access token ──────────────────────
      if (err instanceof MatrixUnauthorizedError) {
        console.warn(
          "[listener] ⚠ Access token rejected (M_UNKNOWN_TOKEN). Attempting re-login…",
        );

        const ok = await reLogin();
        if (ok) {
          // Token refreshed — clear the stale sync token so we do a fresh
          // initial sync with the new session
          clearSyncToken();
          since = undefined;
          console.log(
            "[listener] ✓ Re-login successful. Restarting sync from scratch…",
          );
          continue;
        }

        // Re-login failed — wait longer before retrying
        console.error(
          "[listener] ✗ Re-login failed. Retrying in 30 seconds…",
        );
        await new Promise((resolve) => setTimeout(resolve, 30_000));
        continue;
      }

      console.error(
        "[listener] Sync error:",
        err instanceof Error ? err.message : err,
      );
      // Back off for 5 seconds before retrying
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

main().catch((err) => {
  console.error("[listener] Fatal error:", err);
  process.exit(1);
});
