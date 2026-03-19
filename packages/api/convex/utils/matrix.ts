/**
 * Extracts a robust phone number strictly consisting of digits from a WhatsApp Matrix ID.
 * Returns null if the format doesn't match an expected phone number.
 */
export function extractWhatsAppPhoneNumber(
  matrixId: string | undefined,
): string | null {
  if (!matrixId) return null;
  const localpart = matrixId.split(":")[0];
  if (!localpart) return null;

  // Robust check: match "@whatsapp_[+]?<digits>" to handle both formats
  // (some bridges use @whatsapp_+16477127932, others @whatsapp_16477127932)
  const match = localpart.match(/^@?whatsapp_\+?(\d+)$/);
  return match ? match[1] : null;
}
