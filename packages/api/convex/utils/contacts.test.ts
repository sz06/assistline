import { describe, expect, it } from "vitest";
import { cleanPhoneNumber, isPhoneNumberLike } from "./contacts";

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
