import { describe, expect, it } from "vitest";
import {
  buildConversationSnapshot,
  buildParticipantsBlock,
  buildRolesBlock,
  formatThreadMessage,
  hashString,
} from "./helpers";

// ── formatThreadMessage ──────────────────────────────────────────────────────

describe("formatThreadMessage", () => {
  it("should format an outgoing message as [user]", () => {
    expect(formatThreadMessage("out", "user", "Hi there")).toBe(
      "[out] [user]: Hi there",
    );
  });

  it("should format an inbound message with contactId", () => {
    expect(formatThreadMessage("in", "k17abc", "Hello")).toBe(
      "[in] [contact:k17abc]: Hello",
    );
  });

  it("should show (media) for empty text", () => {
    expect(formatThreadMessage("out", "user", "")).toBe(
      "[out] [user]: (media)",
    );
  });

  it("should show (media) for whitespace-only text", () => {
    expect(formatThreadMessage("in", "k17abc", "   ")).toBe(
      "[in] [contact:k17abc]: (media)",
    );
  });
});

// ── buildParticipantsBlock ───────────────────────────────────────────────────

describe("buildParticipantsBlock", () => {
  it("should return empty string for no profiles", () => {
    expect(buildParticipantsBlock([])).toBe("");
  });

  it("should format a contact with full profile and no pending suggestions", () => {
    const result = buildParticipantsBlock([
      {
        contactId: "k17abc",
        profile: {
          name: "Alice",
          roles: ["Client", "VIP"],
          notes: "Prefers morning calls",
        },
      },
    ]);
    expect(result).toContain("## PARTICIPANTS");
    expect(result).toContain(
      "[contact:k17abc] — name: Alice | roles: Client, VIP | notes: Prefers morning calls",
    );
    expect(result).toContain("pending suggestions: none");
  });

  it("should show 'unknown' for missing name", () => {
    const result = buildParticipantsBlock([{ contactId: "abc", profile: {} }]);
    expect(result).toContain("name: unknown");
  });

  it("should show 'none' for missing roles", () => {
    const result = buildParticipantsBlock([
      { contactId: "abc", profile: { name: "Bob" } },
    ]);
    expect(result).toContain("roles: none");
  });

  it("should show 'none' for missing notes", () => {
    const result = buildParticipantsBlock([
      { contactId: "abc", profile: { name: "Bob" } },
    ]);
    expect(result).toContain("notes: none");
  });

  it("should handle null profile", () => {
    const result = buildParticipantsBlock([
      { contactId: "abc", profile: null },
    ]);
    expect(result).toContain("name: unknown | roles: none | notes: none");
    expect(result).toContain("pending suggestions: none");
  });

  it("should render pending suggestions when present", () => {
    const result = buildParticipantsBlock([
      {
        contactId: "k17abc",
        profile: { name: "Alice" },
        pendingSuggestions: [
          { _id: "sugg1", field: "birthday", value: "1990-05-15" },
          { _id: "sugg2", field: "company", value: "Acme" },
        ],
      },
    ]);
    expect(result).toContain('[id:sugg1] birthday → "1990-05-15"');
    expect(result).toContain('[id:sugg2] company → "Acme"');
    expect(result).not.toContain("pending suggestions: none");
  });

  it("should show 'pending suggestions: none' when pendingSuggestions is empty", () => {
    const result = buildParticipantsBlock([
      {
        contactId: "abc",
        profile: { name: "Bob" },
        pendingSuggestions: [],
      },
    ]);
    expect(result).toContain("pending suggestions: none");
  });
});

// ── buildConversationSnapshot ────────────────────────────────────────────────

describe("buildConversationSnapshot", () => {
  it("should return just conversation block for no profiles", () => {
    const result = buildConversationSnapshot(
      [{ direction: "out", senderContactId: "user", text: "Hi" }],
      [],
    );
    expect(result).toContain("## CONVERSATION");
    expect(result).not.toContain("## PARTICIPANTS");
    expect(result).toContain("[out] [user]: Hi");
  });

  it("should combine participants block with conversation", () => {
    const result = buildConversationSnapshot(
      [
        { direction: "in", senderContactId: "k17abc", text: "Hello" },
        { direction: "out", senderContactId: "user", text: "Hi" },
      ],
      [{ contactId: "k17abc", profile: { name: "Alice" } }],
    );
    const lines = result.split("\n");
    const participantsIdx = lines.findIndex((l) => l === "## PARTICIPANTS");
    const conversationIdx = lines.findIndex((l) => l === "## CONVERSATION");
    expect(participantsIdx).toBeGreaterThanOrEqual(0);
    expect(conversationIdx).toBeGreaterThan(participantsIdx);
    expect(result).toContain("[contact:k17abc] — name: Alice");
    expect(result).toContain("[in] [contact:k17abc]: Hello");
    expect(result).toContain("[out] [user]: Hi");
  });
});

// ── hashString ───────────────────────────────────────────────────────────────

describe("hashString", () => {
  it("should return the same hash for the same input", () => {
    expect(hashString("hello")).toBe(hashString("hello"));
  });

  it("should return different hashes for different inputs", () => {
    expect(hashString("hello")).not.toBe(hashString("world"));
  });

  it("should handle empty string", () => {
    expect(hashString("")).toBe("0");
  });
});

// ── buildRolesBlock ──────────────────────────────────────────────────────────

describe("buildRolesBlock", () => {
  it("should return empty string for no roles", () => {
    expect(buildRolesBlock([])).toBe("");
  });

  it("should format roles with descriptions", () => {
    const result = buildRolesBlock([
      { name: "Client", description: "A paying client" },
      { name: "Friend" },
    ]);
    expect(result).toContain("## AVAILABLE ROLES");
    expect(result).toContain("- **Client**: A paying client");
    expect(result).toContain("- **Friend**");
    expect(result).not.toContain("- **Friend**:");
  });
});
