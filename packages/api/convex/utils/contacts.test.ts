import { describe, expect, it } from "vitest";
import {
  cleanPhoneNumber,
  extractSenderInfo,
  isPhoneNumberLike,
  stripBridgeSuffix,
} from "./contacts";

describe("isPhoneNumberLike", () => {
  it("should detect a plain digit string as a phone number", () => {
    expect(isPhoneNumberLike("14155552671")).toBe(true);
  });

  it("should detect a number with + prefix", () => {
    expect(isPhoneNumberLike("+14155552671")).toBe(true);
  });

  it("should detect a number with spaces and + prefix", () => {
    expect(isPhoneNumberLike("+1 415 555 2671")).toBe(true);
  });

  it("should detect a number with dashes", () => {
    expect(isPhoneNumberLike("415-555-2671")).toBe(true);
  });

  it("should detect a number with parentheses", () => {
    expect(isPhoneNumberLike("(415) 555-2671")).toBe(true);
  });

  it("should NOT detect a real name", () => {
    expect(isPhoneNumberLike("John Smith")).toBe(false);
    expect(isPhoneNumberLike("Ali")).toBe(false);
    expect(isPhoneNumberLike("O'Brien")).toBe(false);
    expect(isPhoneNumberLike("María José")).toBe(false);
  });

  it("should NOT detect an empty string", () => {
    expect(isPhoneNumberLike("")).toBe(false);
  });

  it("should NOT detect a short number (< 7 digits)", () => {
    expect(isPhoneNumberLike("12345")).toBe(false);
    expect(isPhoneNumberLike("+123")).toBe(false);
  });

  it("should detect a long international number", () => {
    expect(isPhoneNumberLike("+44 20 7946 0958")).toBe(true);
  });
});

describe("cleanPhoneNumber", () => {
  it("should strip + and spaces", () => {
    expect(cleanPhoneNumber("+1 415 555 2671")).toBe("14155552671");
  });

  it("should strip dashes and parentheses", () => {
    expect(cleanPhoneNumber("(415) 555-2671")).toBe("4155552671");
  });

  it("should return digits unchanged", () => {
    expect(cleanPhoneNumber("14155552671")).toBe("14155552671");
  });

  it("should handle an empty string", () => {
    expect(cleanPhoneNumber("")).toBe("");
  });
});

describe("stripBridgeSuffix", () => {
  it("should strip (WA) suffix", () => {
    expect(stripBridgeSuffix("+14155552671 (WA)")).toBe("+14155552671");
  });

  it("should strip (WhatsApp) suffix", () => {
    expect(stripBridgeSuffix("John (WhatsApp)")).toBe("John");
  });

  it("should strip (Telegram) suffix", () => {
    expect(stripBridgeSuffix("Alice (Telegram)")).toBe("Alice");
  });

  it("should be case-insensitive", () => {
    expect(stripBridgeSuffix("+1234567890 (wa)")).toBe("+1234567890");
  });

  it("should leave non-bridge suffixes untouched", () => {
    expect(stripBridgeSuffix("John (Work)")).toBe("John (Work)");
  });

  it("should leave plain names untouched", () => {
    expect(stripBridgeSuffix("Alice Smith")).toBe("Alice Smith");
  });
});

describe("extractSenderInfo", () => {
  it("should not save phone-like displayname as otherName", () => {
    const result = extractSenderInfo(
      "@whatsapp_14155552671:matrix.local",
      "+14155552671",
    );
    expect(result.otherName).toBeUndefined();
    expect(result.phone).toBe("14155552671");
  });

  it("should not save phone with (WA) suffix as otherName", () => {
    const result = extractSenderInfo(
      "@whatsapp_14155552671:matrix.local",
      "+1 415 555 2671 (WA)",
    );
    expect(result.otherName).toBeUndefined();
    expect(result.phone).toBe("14155552671");
  });

  it("should save real names as otherName", () => {
    const result = extractSenderInfo(
      "@whatsapp_14155552671:matrix.local",
      "John Smith",
    );
    expect(result.otherName).toBe("John Smith");
    expect(result.phone).toBe("14155552671");
  });

  it("should save names with bridge suffix as otherName (keeping suffix)", () => {
    const result = extractSenderInfo(
      "@whatsapp_14155552671:matrix.local",
      "John (WA)",
    );
    expect(result.otherName).toBe("John (WA)");
    expect(result.phone).toBe("14155552671");
  });
});
