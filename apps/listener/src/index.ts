import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex.js";

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
const SYNC_TOKEN_PATH = process.env.SYNC_TOKEN_PATH ?? "./data/sync-token.json";

// How long to long-poll Dendrite (ms). 30s is the Matrix default.
const SYNC_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Convex client
// ---------------------------------------------------------------------------

const convex = new ConvexHttpClient(CONVEX_URL);

// ---------------------------------------------------------------------------
// Channel resolution — map platform type to Convex channel ID
// ---------------------------------------------------------------------------

/** Known bridge bot prefixes → platform type */
const BRIDGE_BOT_PREFIXES: Record<string, "whatsapp" | "telegram"> = {
  "@whatsappbot:": "whatsapp",
  "@telegrambot:": "telegram",
};

/** In-memory cache: platform type → Convex channel ID */
const channelIdByType: Map<string, string> = new Map();

/**
 * Set of Matrix user IDs that represent the authenticated user's own
 * bridge puppets (e.g. @whatsapp_16477127932:matrix.local).
 * Messages from these senders are "out" — the user sent them from their phone.
 */
const selfPuppetIds = new Set<string>();

/** Refresh the channel ID cache from Convex. */
async function refreshChannelCache(): Promise<void> {
  const platformTypes = ["whatsapp", "telegram"] as const;
  for (const platformType of platformTypes) {
    const channel = await convex.query(api.channels.getByType, {
      type: platformType,
    });
    if (channel) {
      channelIdByType.set(platformType, channel._id);
      console.log(
        `[listener] ✓ Cached channel: ${platformType} → ${channel._id}`,
      );

      // Build the self-puppet Matrix ID from the channel's connected phone
      if (channel.phoneNumber && platformType === "whatsapp") {
        const puppetId = `@whatsapp_${channel.phoneNumber}:${serverName}`;
        selfPuppetIds.add(puppetId);
        console.log(`[listener] ✓ Self-puppet: ${puppetId}`);
      }
    }
  }
}

/**
 * Detect the platform type for a room by examining its members for known
 * bridge bot prefixes. Returns the Convex channel ID if found.
 */
function resolveChannelId(
  members: { state_key: string }[],
): string | undefined {
  for (const member of members) {
    for (const [prefix, platformType] of Object.entries(BRIDGE_BOT_PREFIXES)) {
      if (member.state_key.startsWith(prefix)) {
        return channelIdByType.get(platformType);
      }
    }
  }
  return undefined;
}

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
  redacts?: string; // For m.room.redaction events
  content: {
    msgtype?: string;
    body?: string;
    membership?: string;
    url?: string; // mxc:// URL for media
    info?: {
      mimetype?: string;
      size?: number;
      [key: string]: unknown;
    };
    "m.relates_to"?: {
      rel_type?: string; // "m.annotation" for reactions, "m.replace" for edits
      event_id?: string; // Target event
      key?: string; // Reaction emoji
      "m.in_reply_to"?: { event_id?: string }; // Reply target
    };
    "m.new_content"?: {
      body?: string;
      [key: string]: unknown;
    };
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
        ephemeral?: {
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
    console.error("[listener] Cannot re-login: MATRIX_BOT_PASSWORD is not set");
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
    } catch (_writeErr) {
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

// ---------------------------------------------------------------------------
// Room state helpers — detect groups vs DMs
// ---------------------------------------------------------------------------

interface RoomMemberEvent {
  type: string;
  state_key: string;
  content: {
    membership?: string;
    displayname?: string;
    avatar_url?: string;
  };
}

interface RoomStateEvent {
  type: string;
  content: {
    name?: string;
    topic?: string;
    url?: string; // for m.room.avatar
    [key: string]: unknown;
  };
}

/** Cache of rooms we've already synced metadata for (avoids repeated API calls). */
const syncedRoomMeta = new Set<string>();

/**
 * Fetch room members and state, determine if it's a group, and sync to Convex.
 * Skips rooms already processed (per listener lifetime).
 */
async function syncRoomMetadata(roomId: string): Promise<{
  channelId: string;
  memberCount: number;
  roomName?: string;
  participants: string[];
  topic?: string;
  membersProfile?: Record<string, { displayName?: string; avatarUrl?: string }>;
}> {
  const defaultMeta = {
    channelId: channelIdByType.values().next().value ?? "",
    memberCount: 1,
    participants: [] as string[],
  };

  // Skip if already processed this session
  if (syncedRoomMeta.has(roomId)) {
    return roomMetaCache.get(roomId) ?? defaultMeta;
  }

  try {
    // Fetch joined members
    const membersRes = await matrixFetch(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/members?membership=join`,
    );

    if (!membersRes.ok) {
      console.warn(
        `[listener] Could not fetch members for ${roomId}: ${membersRes.status}`,
      );
      return defaultMeta;
    }

    const membersData = (await membersRes.json()) as {
      chunk: RoomMemberEvent[];
    };

    const joinedMembers = (membersData.chunk ?? []).filter(
      (e) => e.content.membership === "join",
    );

    // Resolve channelId from bridge bot presence
    const channelId = resolveChannelId(joinedMembers) ?? defaultMeta.channelId;

    // Filter out bridge bots, the listener bot, and the user's own puppet
    const realMembers = joinedMembers.filter(
      (m) =>
        !m.state_key.startsWith("@whatsappbot:") &&
        !m.state_key.startsWith("@telegrambot:") &&
        m.state_key !== MATRIX_BOT_USER_ID &&
        !selfPuppetIds.has(m.state_key),
    );

    const memberCount = realMembers.length;
    const isGroup = memberCount > 1;

    // Collect participant matrixIds
    const participants = realMembers.map((m) => m.state_key);

    // Fetch room state for name, topic, avatar
    const stateRes = await matrixFetch(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state`,
    );

    let roomName: string | undefined;
    let roomTopic: string | undefined;
    let roomAvatar: string | undefined;

    if (stateRes.ok) {
      const stateEvents = (await stateRes.json()) as RoomStateEvent[];
      for (const ev of stateEvents) {
        if (ev.type === "m.room.name" && ev.content.name) {
          roomName = ev.content.name;
        }
        if (ev.type === "m.room.topic" && ev.content.topic) {
          roomTopic = ev.content.topic;
        }
        if (ev.type === "m.room.avatar" && ev.content.url) {
          roomAvatar = ev.content.url;
        }
      }
    }

    if (isGroup) {
      console.log(
        `[listener] ✓ Detected group "${roomName ?? roomId}" (${memberCount} members)`,
      );
    }

    // Sync conversation metadata directly (no separate groups table)
    await convex.mutation(api.messages.syncConversationMeta, {
      matrixRoomId: roomId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- anyApi is untyped
      channelId: channelId as any,
      memberCount,
      participants,
      topic: roomTopic,
      name: roomName,
      avatarUrl: roomAvatar,
    });

    const membersProfile: Record<
      string,
      { displayName?: string; avatarUrl?: string }
    > = {};
    for (const m of joinedMembers) {
      if (m.content.displayname || m.content.avatar_url) {
        membersProfile[m.state_key] = {
          displayName: m.content.displayname,
          avatarUrl: m.content.avatar_url,
        };
      }
    }

    const meta = {
      channelId,
      memberCount,
      roomName,
      participants,
      topic: roomTopic,
      membersProfile,
    };
    roomMetaCache.set(roomId, meta);
    syncedRoomMeta.add(roomId);

    return meta;
  } catch (err) {
    console.error(
      `[listener] Failed to sync room metadata for ${roomId}:`,
      err instanceof Error ? err.message : err,
    );
    return defaultMeta;
  }
}

/** In-memory cache of room metadata for the current session. */
const roomMetaCache = new Map<
  string,
  {
    channelId: string;
    memberCount: number;
    roomName?: string;
    participants: string[];
    topic?: string;
    membersProfile?: Record<
      string,
      { displayName?: string; avatarUrl?: string }
    >;
  }
>();

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
        timeline: {
          types: ["m.room.message", "m.reaction", "m.room.redaction"],
        },
        ephemeral: {
          types: ["m.receipt", "m.typing"],
        },
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
      throw new MatrixUnauthorizedError(`Sync failed: ${res.status} ${body}`);
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
  roomMeta?: {
    channelId: string;
    memberCount: number;
    roomName?: string;
    participants: string[];
    topic?: string;
    membersProfile?: Record<
      string,
      { displayName?: string; avatarUrl?: string }
    >;
  },
): Promise<void> {
  const direction: "in" | "out" =
    event.sender === MATRIX_BOT_USER_ID || selfPuppetIds.has(event.sender)
      ? "out"
      : "in";

  try {
    // ── Reactions ──
    if (event.type === "m.reaction") {
      const relatesTo = event.content["m.relates_to"];
      const targetEventId = relatesTo?.event_id;
      const reactionKey = relatesTo?.key;
      if (targetEventId && reactionKey) {
        await convex.mutation(api.messages.addReaction, {
          eventId: targetEventId,
          reactionKey,
          sender: event.sender,
        });
        console.log(
          `[listener] 😀 Reaction ${reactionKey} on ${targetEventId} by ${event.sender}`,
        );
      }
      return;
    }

    // ── Redactions (message deletions) ──
    if (event.type === "m.room.redaction") {
      const redactedEventId = event.redacts;
      if (redactedEventId) {
        await convex.mutation(api.messages.redactMessage, {
          eventId: redactedEventId,
        });
        console.log(
          `[listener] 🗑 Redacted ${redactedEventId} by ${event.sender}`,
        );
      }
      return;
    }

    // ── From here: m.room.message ──
    if (event.type !== "m.room.message") return;

    // ── Message edits ──
    const relatesTo = event.content["m.relates_to"];
    if (relatesTo?.rel_type === "m.replace" && relatesTo.event_id) {
      const newBody =
        (event.content["m.new_content"] as { body?: string } | undefined)
          ?.body ?? event.content.body;
      if (newBody) {
        await convex.mutation(api.messages.editMessage, {
          eventId: relatesTo.event_id,
          newText: newBody,
          editTimestamp: event.origin_server_ts,
        });
        console.log(
          `[listener] ✏️ Edit on ${relatesTo.event_id} by ${event.sender}`,
        );
      }
      return;
    }

    // ── Determine message type and extract data ──
    const msgtype = event.content.msgtype;
    if (!msgtype) return;

    // Map Matrix msgtypes to our schema types
    const typeMap: Record<string, string> = {
      "m.text": "text",
      "m.image": "image",
      "m.video": "video",
      "m.audio": "audio",
      "m.file": "file",
      "m.notice": "notice",
    };
    const messageType = typeMap[msgtype];
    if (!messageType) return; // Skip unsupported msgtypes

    const body = event.content.body ?? "";
    const senderProfile = roomMeta?.membersProfile?.[event.sender];

    // Extract reply target
    const replyToEventId = relatesTo?.["m.in_reply_to"]?.event_id ?? undefined;

    // Extract attachment metadata for media messages
    const attachmentUrl = event.content.url as string | undefined;
    const attachmentMimeType = event.content.info?.mimetype;
    const attachmentFileName =
      messageType !== "text" && messageType !== "notice"
        ? (event.content.body ?? undefined)
        : undefined;
    const attachmentSize = event.content.info?.size;

    const messageId = await convex.mutation(api.messages.insertMessage, {
      matrixRoomId: roomId,
      eventId: event.event_id,
      sender: event.sender,
      text: body,
      direction,
      timestamp: event.origin_server_ts,
      type: messageType,
      replyToEventId,
      attachmentUrl,
      attachmentMimeType,
      attachmentFileName,
      attachmentSize,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- anyApi is untyped
      channelId: (roomMeta?.channelId ?? "") as any,
      memberCount: roomMeta?.memberCount ?? 1,
      participants: roomMeta?.participants ?? [],
      topic: roomMeta?.topic,
      roomName: roomMeta?.roomName,
      senderName: senderProfile?.displayName,
      senderAvatarUrl: senderProfile?.avatarUrl,
    });

    const isGroup = (roomMeta?.memberCount ?? 0) > 1;
    const typeLabel =
      messageType !== "text" ? ` [${messageType.toUpperCase()}]` : "";
    console.log(
      `[listener] ${direction === "in" ? "⬇" : "⬆"} ${event.sender} → ${roomId}${isGroup ? " [GROUP]" : ""}${typeLabel} | eventId=${event.event_id} | convexId=${messageId}`,
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

  // Build the channel cache so we can resolve platform → channelId
  await refreshChannelCache();

  // Persist Matrix credentials in Convex settings so the Convex action
  // (sendReadReceipt) can call the Matrix API without the listener
  try {
    await convex.mutation(api.settings.set, {
      key: "matrix_homeserver_url",
      value: MATRIX_HOMESERVER_URL,
    });
    await convex.mutation(api.settings.set, {
      key: "matrix_bot_access_token",
      value: currentAccessToken,
    });
    console.log("[listener] ✓ Matrix credentials persisted to Convex settings");
  } catch (err) {
    console.warn(
      "[listener] ⚠ Failed to persist Matrix credentials:",
      err instanceof Error ? err.message : err,
    );
  }

  if (channelIdByType.size === 0) {
    console.warn(
      "[listener] ⚠ No channels found in Convex. Conversations will not be created until channels are configured.",
    );
  }

  let since = loadSyncToken();
  let isInitialSync = !since;

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
        const roomEntries = Object.entries(response.rooms.join);

        if (isInitialSync) {
          // On initial sync, classify ALL joined rooms (even those without events)
          console.log(
            `[listener] Initial sync: classifying ${roomEntries.length} joined rooms…`,
          );
        }

        for (const [roomId, room] of roomEntries) {
          const events = room.timeline?.events ?? [];

          // On initial sync, sync metadata for ALL rooms.
          // On incremental syncs, only sync rooms with new events.
          if (events.length > 0 || isInitialSync) {
            const roomMeta = await syncRoomMetadata(roomId);

            for (const event of events) {
              await handleTimelineEvent(roomId, event, roomMeta);
            }
          }

          // ── Process ephemeral events (receipts, typing) ──
          const ephemeralEvents = room.ephemeral?.events ?? [];
          for (const event of ephemeralEvents) {
            try {
              if (event.type === "m.receipt" && event.content) {
                // Find the latest read event ID from any user
                for (const [eventId, readers] of Object.entries(
                  event.content as Record<string, Record<string, unknown>>,
                )) {
                  const readReceipts = (readers as Record<string, unknown>)[
                    "m.read"
                  ] as Record<string, unknown> | undefined;
                  if (readReceipts) {
                    // Check if any of the readers is the self-puppet or bot
                    for (const userId of Object.keys(readReceipts)) {
                      if (
                        userId === MATRIX_BOT_USER_ID ||
                        selfPuppetIds.has(userId)
                      ) {
                        await convex.mutation(api.conversations.markRead, {
                          matrixRoomId: roomId,
                          lastReadEventId: eventId,
                        });
                        console.log(
                          `[listener] ✓ Read receipt: ${roomId} → ${eventId}`,
                        );
                      }
                    }
                  }
                }
              }

              if (event.type === "m.typing" && event.content) {
                const typingUserIds = (event.content.user_ids ??
                  []) as string[];
                // Filter out self and bot from typing list
                const others = typingUserIds.filter(
                  (id) => id !== MATRIX_BOT_USER_ID && !selfPuppetIds.has(id),
                );
                await convex.mutation(api.conversations.setTyping, {
                  matrixRoomId: roomId,
                  typingUsers: others,
                });
              }
            } catch (err) {
              console.error(
                `[listener] Ephemeral event error in ${roomId}:`,
                err instanceof Error ? err.message : err,
              );
            }
          }
        }

        if (isInitialSync) {
          console.log(
            `[listener] ✓ Initial sync complete. Classified ${syncedRoomMeta.size} rooms.`,
          );
          isInitialSync = false;
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
        console.error("[listener] ✗ Re-login failed. Retrying in 30 seconds…");
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
