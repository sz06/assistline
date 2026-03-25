/**
 * Pure helper functions for the Dispatcher agent.
 * No Convex runtime dependency — all inputs are passed as arguments.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface ConversationMessage {
  sender: string;
  direction: string;
  text: string;
  timestamp: number;
}

export interface ContactProfile {
  contactId: string;
  profile: Record<string, unknown> | null;
}

export interface MessageBlock {
  content: string;
  lastTimestamp: number;
}

// ── Functions ────────────────────────────────────────────────────────────────

/**
 * Format a single conversation message for the agent thread.
 *
 * @example
 * formatThreadMessage("in", "k17abc", "Hello") // "[in] [contact:k17abc]: Hello"
 * formatThreadMessage("out", "user", "Hi")      // "[out] [user]: Hi"
 */
export function formatThreadMessage(
  direction: string,
  senderContactId: string,
  text: string,
): string {
  const senderLabel =
    direction === "in" ? `[contact:${senderContactId}]` : "[user]";
  const displayText = text.trim() || "(media)";
  return `[${direction}] ${senderLabel}: ${displayText}`;
}

/**
 * Concatenate an array of conversation messages into a single formatted string
 * suitable for saving as one thread row.
 *
 * @param messages    - The raw conversation messages
 * @param contactMap  - Map of matrixId → contactId (already resolved)
 * @param heading     - Optional heading (e.g. "CONVERSATION HISTORY", "CATCH-UP")
 *
 * @returns { content, lastTimestamp } or null if messages is empty
 */
export function buildMessageBlock(
  messages: ConversationMessage[],
  contactMap: Record<string, string>,
  heading?: string,
): MessageBlock | null {
  if (messages.length === 0) return null;

  const lines = messages.map((msg) => {
    const contactId = contactMap[msg.sender] ?? "unknown";
    return formatThreadMessage(
      msg.direction,
      msg.direction === "out" ? "user" : contactId,
      msg.text,
    );
  });

  // Single message without heading: inline. Multiple or with heading: wrap.
  const content =
    messages.length === 1 && !heading
      ? lines[0]
      : `## ${heading ?? "MESSAGES"}\n\n${lines.join("\n")}`;

  return {
    content,
    lastTimestamp: Math.max(...messages.map((m) => m.timestamp)),
  };
}

/**
 * Build the PARTICIPANTS section of the prompt from resolved contact profiles.
 */
export function buildParticipantsBlock(profiles: ContactProfile[]): string {
  if (profiles.length === 0) return "";

  const lines = profiles.map(({ contactId, profile }) => {
    if (!profile) return `- [contact:${contactId}]: (profile not found)`;
    const details: string[] = [];
    if (profile.name) details.push(`Name: "${profile.name}"`);
    if (
      profile.phoneNumbers &&
      Array.isArray(profile.phoneNumbers) &&
      profile.phoneNumbers.length > 0
    ) {
      const phones = profile.phoneNumbers
        .map(
          (p: { label?: string; value?: string }) =>
            `${p.value}${p.label ? ` (${p.label})` : ""}`,
        )
        .join(", ");
      details.push(`Phone: ${phones}`);
    }
    if (profile.company) details.push(`Company: "${profile.company}"`);
    if (profile.jobTitle) details.push(`Job: "${profile.jobTitle}"`);
    if (
      profile.roles &&
      Array.isArray(profile.roles) &&
      profile.roles.length > 0
    ) {
      details.push(`Roles: [${profile.roles.join(", ")}]`);
    }
    if (profile.notes) details.push(`Notes: "${profile.notes}"`);

    // If no details, just show the contact reference without a trailing colon
    if (details.length === 0) return `- [contact:${contactId}]`;
    return `- [contact:${contactId}]: ${details.join(", ")}`;
  });

  return `## PARTICIPANTS\n\n${lines.join("\n")}`;
}

/**
 * Build the AVAILABLE ROLES section from all system roles.
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
