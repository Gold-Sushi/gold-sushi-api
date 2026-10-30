/**
 * Normalizes a Ukrainian phone number to E.164 (`+380XXXXXXXXX`) so the same
 * number always gets the same stored value, which keeps the unique constraint
 * meaningful.
 *
 * Accepts the common input shapes: `+380 67 123 45 67`, `380671234567`,
 * `067-123-45-67`, `0671234567`. Anything else is returned trimmed and
 * unchanged, so validation can still reject it.
 */
export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');

  // National format: 0XXXXXXXXX (10 digits)
  if (digits.length === 10 && digits.startsWith('0')) {
    return `+38${digits}`;
  }

  // International without plus: 380XXXXXXXXX (12 digits)
  if (digits.length === 12 && digits.startsWith('380')) {
    return `+${digits}`;
  }

  return trimmed;
}
