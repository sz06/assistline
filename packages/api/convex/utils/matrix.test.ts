import { describe, expect, it } from "vitest";
import { extractWhatsAppPhoneNumber } from "./matrix";

describe("extractWhatsAppPhoneNumber", () => {
  it("should extract phone number from a standard WhatsApp Matrix ID", () => {
    expect(
      extractWhatsAppPhoneNumber("@whatsapp_14155552671:server.local"),
    ).toBe("14155552671");
  });

  it("should extract phone number from an ID with + prefix (self-puppet)", () => {
    expect(
      extractWhatsAppPhoneNumber("@whatsapp_+16477127932:matrix.local"),
    ).toBe("16477127932");
  });

  it("should extract phone number from ID without @ prefix", () => {
    expect(extractWhatsAppPhoneNumber("whatsapp_1234567890:server.local")).toBe(
      "1234567890",
    );
  });

  it("should return null for WhatsApp groups or bots", () => {
    expect(extractWhatsAppPhoneNumber("@whatsappbot:server.local")).toBeNull();
    expect(
      extractWhatsAppPhoneNumber("@whatsapp_12345-67890:server.local"),
    ).toBeNull();
    expect(
      extractWhatsAppPhoneNumber("@whatsapp_group_123:server.local"),
    ).toBeNull();
  });

  it("should return null for other bridge prefixes", () => {
    expect(
      extractWhatsAppPhoneNumber("@telegram_123456:server.local"),
    ).toBeNull();
  });

  it("should return null for an empty string or undefined", () => {
    expect(extractWhatsAppPhoneNumber("")).toBeNull();
    expect(extractWhatsAppPhoneNumber(undefined)).toBeNull();
    expect(extractWhatsAppPhoneNumber("just_random_string")).toBeNull();
  });
});
