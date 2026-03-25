import { describe, expect, it } from "vitest";
import {
  buildMessageBlock,
  buildParticipantsBlock,
  buildRolesBlock,
  formatThreadMessage,
} from "./helpers";

// ── formatThreadMessage ──────────────────────────────────────────────────────

describe("formatThreadMessage", () => {
  it("should format an incoming message with contactId", () => {
    expect(formatThreadMessage("in", "k17abc", "Hello")).toBe(
      "[in] [contact:k17abc]: Hello",
    );
  });

  it("should format an outgoing message with [user] label", () => {
    expect(formatThreadMessage("out", "user", "Hi there")).toBe(
      "[out] [user]: Hi there",
    );
  });

  it("should show (media) for empty text", () => {
    expect(formatThreadMessage("in", "k17abc", "")).toBe(
      "[in] [contact:k17abc]: (media)",
    );
  });

  it("should show (media) for whitespace-only text", () => {
    expect(formatThreadMessage("in", "k17abc", "   ")).toBe(
      "[in] [contact:k17abc]: (media)",
    );
  });

  it("should handle multiline text", () => {
    const result = formatThreadMessage("in", "contactA", "line1\nline2");
    expect(result).toBe("[in] [contact:contactA]: line1\nline2");
  });
});

// ── buildMessageBlock ────────────────────────────────────────────────────────

describe("buildMessageBlock", () => {
  const contactMap: Record<string, string> = {
    "@alice:matrix.local": "contactAlice",
    "@bob:matrix.local": "contactBob",
  };

  it("should return null for empty messages array", () => {
    expect(buildMessageBlock([], contactMap)).toBeNull();
  });

  it("should format a single message inline without heading", () => {
    const result = buildMessageBlock(
      [
        {
          sender: "@alice:matrix.local",
          direction: "in",
          text: "Hey",
          timestamp: 1000,
        },
      ],
      contactMap,
    );
    expect(result).toEqual({
      content: "[in] [contact:contactAlice]: Hey",
      lastTimestamp: 1000,
    });
  });

  it("should wrap multiple messages with a heading", () => {
    const result = buildMessageBlock(
      [
        {
          sender: "@alice:matrix.local",
          direction: "in",
          text: "Hey",
          timestamp: 1000,
        },
        {
          sender: "@bob:matrix.local",
          direction: "in",
          text: "Hi",
          timestamp: 2000,
        },
      ],
      contactMap,
    );
    expect(result).toEqual({
      content:
        "## MESSAGES\n\n[in] [contact:contactAlice]: Hey\n[in] [contact:contactBob]: Hi",
      lastTimestamp: 2000,
    });
  });

  it("should use the provided heading", () => {
    const result = buildMessageBlock(
      [
        {
          sender: "@alice:matrix.local",
          direction: "in",
          text: "Hello",
          timestamp: 500,
        },
        {
          sender: "@bob:matrix.local",
          direction: "out",
          text: "Hi back",
          timestamp: 600,
        },
      ],
      contactMap,
      "CONVERSATION HISTORY",
    );
    expect(result?.content).toMatch(/^## CONVERSATION HISTORY/);
    expect(result?.content).toContain("[in] [contact:contactAlice]: Hello");
    expect(result?.content).toContain("[out] [user]: Hi back");
    expect(result?.lastTimestamp).toBe(600);
  });

  it("should always use heading for single message if heading is provided", () => {
    const result = buildMessageBlock(
      [
        {
          sender: "@alice:matrix.local",
          direction: "in",
          text: "Solo",
          timestamp: 100,
        },
      ],
      contactMap,
      "CATCH-UP",
    );
    expect(result?.content).toBe(
      "## CATCH-UP\n\n[in] [contact:contactAlice]: Solo",
    );
  });

  it("should use 'unknown' for unresolved senders", () => {
    const result = buildMessageBlock(
      [
        {
          sender: "@unknown:matrix.local",
          direction: "in",
          text: "Who am I",
          timestamp: 100,
        },
      ],
      contactMap,
    );
    expect(result?.content).toBe("[in] [contact:unknown]: Who am I");
  });

  it("should use [user] for outgoing messages regardless of sender", () => {
    const result = buildMessageBlock(
      [
        {
          sender: "@me:matrix.local",
          direction: "out",
          text: "Going out",
          timestamp: 300,
        },
      ],
      contactMap,
    );
    expect(result?.content).toBe("[out] [user]: Going out");
  });

  it("should return the max timestamp across all messages", () => {
    const result = buildMessageBlock(
      [
        {
          sender: "@alice:matrix.local",
          direction: "in",
          text: "A",
          timestamp: 500,
        },
        {
          sender: "@bob:matrix.local",
          direction: "in",
          text: "B",
          timestamp: 100,
        },
        {
          sender: "@alice:matrix.local",
          direction: "in",
          text: "C",
          timestamp: 999,
        },
      ],
      contactMap,
    );
    expect(result?.lastTimestamp).toBe(999);
  });
});

// ── buildParticipantsBlock ───────────────────────────────────────────────────

describe("buildParticipantsBlock", () => {
  it("should return empty string for no profiles", () => {
    expect(buildParticipantsBlock([])).toBe("");
  });

  it("should handle a profile not found", () => {
    const result = buildParticipantsBlock([
      { contactId: "abc", profile: null },
    ]);
    expect(result).toContain("(profile not found)");
  });

  it("should show bare contact reference for empty profile", () => {
    const result = buildParticipantsBlock([{ contactId: "xyz", profile: {} }]);
    expect(result).toContain("- [contact:xyz]");
    // Should NOT have a trailing colon or comma
    expect(result).not.toContain("- [contact:xyz]:");
  });

  it("should include name, phone, company, and roles", () => {
    const result = buildParticipantsBlock([
      {
        contactId: "xyz",
        profile: {
          name: "Alice",
          phoneNumbers: [{ value: "+123", label: "Mobile" }],
          company: "Acme",
          roles: ["Client", "VIP"],
        },
      },
    ]);
    expect(result).toContain("## PARTICIPANTS");
    expect(result).toContain("[contact:xyz]:");
    expect(result).toContain('Name: "Alice"');
    expect(result).toContain("Phone: +123 (Mobile)");
    expect(result).toContain('Company: "Acme"');
    expect(result).toContain("Roles: [Client, VIP]");
  });

  it("should handle multiple participants", () => {
    const result = buildParticipantsBlock([
      { contactId: "a", profile: { name: "Alice" } },
      { contactId: "b", profile: { name: "Bob" } },
    ]);
    expect(result).toContain("[contact:a]:");
    expect(result).toContain("[contact:b]:");
  });

  it("should include job title and notes when present", () => {
    const result = buildParticipantsBlock([
      {
        contactId: "c",
        profile: { name: "Carol", jobTitle: "CEO", notes: "Important client" },
      },
    ]);
    expect(result).toContain('Job: "CEO"');
    expect(result).toContain('Notes: "Important client"');
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
    // Friend should not have a colon since no description
    expect(result).not.toContain("- **Friend**:");
  });
});
