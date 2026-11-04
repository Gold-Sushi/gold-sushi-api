/**
 * Normalizes an email for storage and lookup. Mailbox names are treated as
 * case-insensitive by every provider we care about, so `Ivan@x.com` and
 * `ivan@x.com` must resolve to the same account.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
