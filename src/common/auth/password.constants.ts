/** Shortest password we accept anywhere in the app. */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * bcrypt silently truncates anything past 72 bytes, so accepting longer
 * passwords would give users a false sense of strength.
 */
export const PASSWORD_MAX_LENGTH = 72;

/** How long an emailed reset link stays usable. */
export const PASSWORD_RESET_TTL_MINUTES = 30;

/**
 * Returned by `forgot-password` whether or not the address belongs to an
 * account — a per-case message would let anyone enumerate registered emails.
 */
export const PASSWORD_RESET_GENERIC_MESSAGE =
  'Якщо для цієї адреси існує обліковий запис, ми надіслали лист із посиланням для відновлення паролю.';
