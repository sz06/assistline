/**
 * Detects whether a display name is actually a phone number.
 * WhatsApp bridge uses the phone number as displayname when no contact name exists.
 * Matches patterns like: "+1 415 555 2671", "14155552671", "+14155552671", "(415) 555-2671"
 */
export function isPhoneNumberLike(value: string): boolean {
  // If the display name contains letters, it's almost certainly a pure name string
  if (/[A-Za-z]/.test(value)) return false;

  // Strip common phone formatting chars and any weird unicode spacing/hyphens, then check digit length
  const stripped = value.replace(/[^\d]/g, "");
  return stripped.length >= 7;
}

/**
 * Cleans a phone-number-like string to just digits (removing +, spaces, dashes, parens, etc.)
 */
export function cleanPhoneNumber(value: string): string {
  return value.replace(/[^\d]/g, "");
}

/**
 * Strip common bridge suffixes from display names.
 * E.g. "+14155552671 (WA)" → "+14155552671", "John (Telegram)" → "John"
 */
export function stripBridgeSuffix(value: string): string {
  return value
    .replace(/\s*\((?:WA|WhatsApp|Telegram|TG|Signal)\)\s*$/i, "")
    .trim();
}

/**
 * Derive platform, phone number, and other-name entry from a Matrix sender ID
 * and optional bridge-provided display name.
 *
 * If the display name is just a phone number (optionally with a bridge suffix
 * like "(WA)"), it is NOT returned as `otherName` — only as `phone`.
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

  const trimmed = senderName?.trim() || undefined;
  // Strip bridge suffix before checking if the name is a phone number
  const stripped = trimmed ? stripBridgeSuffix(trimmed) : undefined;
  const nameIsPhone = stripped ? isPhoneNumberLike(stripped) : false;

  // Prefer digits from Matrix ID; fall back to cleaning phone-like displayname
  const phoneFromId = localpart?.match(/^@?whatsapp_\+?(\d+)$/)?.[1] ?? null;
  const phone =
    phoneFromId ??
    (nameIsPhone && stripped ? cleanPhoneNumber(stripped) : undefined);

  // Only save as otherName if it's NOT a phone number
  const otherName = nameIsPhone ? undefined : trimmed;

  return { platform, phone, otherName };
}
