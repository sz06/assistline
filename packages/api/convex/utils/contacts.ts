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

/**
 * Derive platform, phone number, and other-name entry from a Matrix sender ID
 * and optional bridge-provided display name.
 */
export function extractSenderInfo(
  matrixId: string,
  senderName?: string,
): {
  platform: string | undefined;
  phone: string | undefined;
  otherName: string | undefined;
} {
  const localpart = matrixId.split(":")[0];
  const platform = localpart?.includes("whatsapp_") ? "whatsapp" : undefined;

  // Extract phone from Matrix ID (e.g. @whatsapp_14155552671:server)
  const trimmed = senderName?.trim() || undefined;
  const nameIsPhone = trimmed ? isPhoneNumberLike(trimmed) : false;

  // Prefer digits from Matrix ID; fall back to cleaning phone-like displayname
  const phoneFromId = localpart?.match(/^@?whatsapp_\+?(\d+)$/)?.[1] ?? null;
  const phone =
    phoneFromId ??
    (nameIsPhone && trimmed ? cleanPhoneNumber(trimmed) : undefined);

  // Any non-empty senderName becomes an otherName entry (kept as-is with bridge suffixes)
  const otherName = trimmed ?? undefined;

  return { platform, phone, otherName };
}
