/**
 * Pure helper functions for the Dispatcher agent.
 * No Convex runtime dependency — all inputs are passed as arguments.
 */

import type { ProfileShape } from "../../contacts/shared";

// Re-export so existing consumers don't break
export type { ProfileShape };

// ── Types ────────────────────────────────────────────────────────────────────

export interface ConversationMessage {
  sender: string;
  text: string;
  timestamp: number;
}

export interface PendingSuggestion {
  _id: string;
  field: string;
  value: string;
}

export interface ContactProfile {
  contactId: string;
  profile: ProfileShape | null;
  pendingSuggestions?: PendingSuggestion[];
}

// ── Functions ────────────────────────────────────────────────────────────────

/**
 * Format a single conversation message for the agent thread.
 * Compact format — profile details live in the PARTICIPANTS block, not here.
 *
 * @example
 * formatThreadMessage("k17abc", "Hello") // "[contact:k17abc]: Hello"
 * formatThreadMessage("user", "Hi")      // "[user]: Hi"
 */
export function formatThreadMessage(
  senderContactId: string,
  text: string,
): string {
  const displayText = text.trim() || "(media)";
  if (senderContactId === "user") {
    return `[user]: ${displayText}`;
  }
  return `[contact:${senderContactId}]: ${displayText}`;
}

/**
 * Build the PARTICIPANTS block from resolved contact profiles.
 * Written once per snapshot — verbose profile info (name, roles, notes;
 * phone excluded as not useful to the LLM).
 *
 * Unknown/missing fields are shown explicitly so the LLM knows the gap
 * and can suggest contact updates via forwardContactNotes.
 *
 * @example
 * ## PARTICIPANTS
 *
 * [contact:k17abc] — name: Alice | roles: Client, VIP | notes: Prefers morning calls
 * [contact:j29xyz] — name: unknown | roles: none | notes: none
 */
export function buildParticipantsBlock(profiles: ContactProfile[]): string {
  if (profiles.length === 0) return "";

  const lines = profiles.map(({ contactId, profile, pendingSuggestions }) => {
    const name = profile?.name || "unknown";
    const company = profile?.company || "unknown";
    const jobTitle = profile?.jobTitle || "unknown";
    const birthday = profile?.birthday || "unknown";

    // For arrays, if they have items, list them or say "known", else "none"
    const roles =
      profile?.roles && profile.roles.length > 0
        ? profile.roles.join(", ")
        : "none";
    const addresses =
      profile?.addresses && profile.addresses.length > 0
        ? profile.addresses.join("; ")
        : "none";
    const emails =
      profile?.emails && profile.emails.length > 0
        ? profile.emails.map((e) => e.value).join("; ")
        : "none";
    const phoneNumbers =
      profile?.phoneNumbers && profile.phoneNumbers.length > 0
        ? profile.phoneNumbers.map((p) => p.value).join("; ")
        : "none";
        
    const notes = profile?.notes || "none";

    const profileLine = `[contact:${contactId}] — name: ${name} | title: ${jobTitle} | company: ${company} | email: ${emails} | phone: ${phoneNumbers} | addresses: ${addresses} | birthday: ${birthday} | roles: ${roles} | notes: ${notes}`;

    // Append pending suggestions so the DA knows what's already queued
    if (pendingSuggestions && pendingSuggestions.length > 0) {
      const suggLines = pendingSuggestions
        .map((s) => `[id:${s._id}] ${s.field} → "${s.value}"`)
        .join(", ");
      return `${profileLine}\n  pending suggestions: ${suggLines}`;
    }
    return `${profileLine}\n  pending suggestions: none`;
  });

  return `## PARTICIPANTS\n\n${lines.join("\n")}`;
}

/**
 * Build a full snapshot string from a list of messages and their resolved
 * unique participant profiles.
 *
 * Layout:
 *   ## PARTICIPANTS
 *   [contact:id] — name: ... | roles: ... | notes: ...
 *   ...
 *
 *   ## CONVERSATION
 *   [contact:id]: message text
 *   [user]: message text
 *   ...
 */
export function buildConversationSnapshot(
  messages: Array<{
    senderContactId: string; // resolved Convex contact ID, "user", or "unknown"
    text: string;
  }>,
  profiles: ContactProfile[],
): string {
  const participantsBlock = buildParticipantsBlock(profiles);
  const conversationLines = messages.map((m) =>
    formatThreadMessage(m.senderContactId, m.text),
  );
  const conversationBlock = `## CONVERSATION\n\n${conversationLines.join("\n")}`;

  return participantsBlock
    ? `${participantsBlock}\n\n${conversationBlock}`
    : conversationBlock;
}

/**
 * Compute a simple deterministic hash of a string.
 * Used to detect unchanged snapshots and skip redundant LLM calls.
 * Not cryptographic — correctness over security.
 */
export function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(16);
}

/**
 * Build the AVAILABLE ROLES section for the system prompt.
 */
export function buildRolesBlock(
  roles: Array<{ name: string; description?: string }>,
): string {
  if (roles.length === 0) return "";
  const lines = roles.map(
    (r) => `- **${r.name}**${r.description ? `: ${r.description}` : ""}`,
  );
  return `## AVAILABLE ROLES\n\n${lines.join("\n")}`;
}
