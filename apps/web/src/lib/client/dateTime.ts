/**
 * Formats a timestamp in whatever timezone `Intl.DateTimeFormat` resolves
 * for the *current runtime* — the browser's local zone when called
 * client-side, or the server process's zone (UTC on Vercel) if ever called
 * during SSR. Every Postgres column feeding this (last_seen_at, started_at,
 * completed_at, requested_at, created_at, ...) is `timestamptz`, and
 * PostgREST/supabase-js serialize those as absolute ISO 8601 strings with an
 * explicit offset (e.g. `2026-07-23T01:47:00+00:00`, equivalent to a `Z`
 * suffix) — `new Date(iso)` already parses that correctly as an absolute
 * instant. There is no timezone info being stripped anywhere; the bug this
 * fixes is purely about *where* formatting runs, not the data.
 *
 * Never call this during server rendering — use the <LocalTime> client
 * component instead, which defers the call to a post-mount effect so the
 * server/first-client-render HTML always matches (no hydration mismatch)
 * and the visible value is always the visitor's own local time.
 */
export function formatDateTime(
  iso: string | null | undefined,
  options: Intl.DateTimeFormatOptions = DATE_TIME,
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, options).format(date);
}

/** Hour:minute:second — e.g. "Last Heartbeat" on the dashboard. */
export const TIME_WITH_SECONDS: Intl.DateTimeFormatOptions = {
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
};

/** Numeric date + time-with-seconds — matches the shape of a bare `toLocaleString()` call. */
export const DATE_TIME: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
};
