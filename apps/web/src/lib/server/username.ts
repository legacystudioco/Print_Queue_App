import 'server-only';

/**
 * This household's accounts authenticate with a username, but Supabase
 * Auth still fundamentally stores an email per user. Rather than expose
 * real email addresses anywhere in the app, every account uses a
 * non-personal, app-only address at this fixed internal domain — e.g.
 * "Tyler" -> "tyler@printqueue.local". Nothing is ever sent to this
 * domain; it only exists as a stable identifier inside Supabase Auth.
 *
 * This module is `server-only` and intentionally not re-exported from
 * @print-queue/shared: the mapping must never run in, or be inlined into,
 * browser code.
 */
const INTERNAL_EMAIL_DOMAIN = 'printqueue.local';

/** Letters, numbers, underscore, hyphen — no spaces, no @, 1-32 chars. */
const USERNAME_PATTERN = /^[a-z0-9_-]{1,32}$/;

export function normalizeUsername(rawUsername: string): string {
  return rawUsername.trim().toLowerCase();
}

/**
 * Maps a household username to its internal Supabase Auth email.
 * Returns null for anything that isn't a plausible username shape (empty,
 * too long, contains characters outside [a-z0-9_-]) so callers can fold
 * that into the same generic "invalid username or password" outcome as a
 * wrong password — never a distinct "unknown user" signal.
 */
export function usernameToInternalEmail(rawUsername: string): string | null {
  const normalized = normalizeUsername(rawUsername);
  if (!USERNAME_PATTERN.test(normalized)) return null;
  return `${normalized}@${INTERNAL_EMAIL_DOMAIN}`;
}
