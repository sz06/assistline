/**
 * Detects whether a display name is actually a phone number.
 * WhatsApp bridge uses the phone number as displayname when no contact name exists.
 * Matches patterns like: "+1 415 555 2671", "14155552671", "+14155552671", "(415) 555-2671"
 */
export function isPhoneNumberLike(value: string): boolean {
  // Strip common phone formatting chars, then check if what's left is all digits
  const stripped = value.replace(/[\s\-()+ ]/g, "");
  // Must be at least 7 digits and all numeric
  return stripped.length >= 7 && /^\d+$/.test(stripped);
}

/**
 * Cleans a phone-number-like string to just digits (removing +, spaces, dashes, parens, etc.)
 */
export function cleanPhoneNumber(value: string): string {
  return value.replace(/[^\d]/g, "");
}
