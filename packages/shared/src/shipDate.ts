/**
 * A job's optional Ship By deadline (`jobs.ship_by_date`) is a Postgres
 * `date` — a plain "YYYY-MM-DD" calendar day with no time-of-day or
 * timezone attached. Every function here works directly on that string's
 * year/month/day components and NEVER calls `new Date(dateOnlyString)` —
 * per ECMA-262, a bare date-only ISO string parses as UTC midnight, and
 * formatting that instant in a negative-UTC-offset timezone (most of the
 * Americas) displays the *previous* calendar day. That's the exact bug
 * this file exists to avoid.
 */

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function parseDateOnly(value: string): DateParts {
  const [year, month, day] = value.split('-').map(Number);
  return { year: year!, month: month!, day: day! };
}

/** A pure integer day index — safe to subtract two of these for an exact day count, since both are built the same way and never touch local time. */
function dayIndex({ year, month, day }: DateParts): number {
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

const SHIP_DATE_LABEL_FORMAT: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

/**
 * "Aug 14" — a pure function of the date string alone, with no dependency
 * on "today". Safe to use as an SSR-rendered / first-client-render
 * fallback (see ShipByLine) since it can't ever mismatch between server
 * and client the way a "today"-relative label could.
 */
export function formatShipDateOnly(dateOnly: string): string {
  const { year, month, day } = parseDateOnly(dateOnly);
  // Local-constructor Date (not `new Date(string)`) — the y/m/d components
  // are taken literally as a local wall-clock date, so formatting it back
  // out can never shift the calendar day.
  const localDate = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat(undefined, SHIP_DATE_LABEL_FORMAT).format(localDate);
}

/** "YYYY-MM-DD" for the given moment's LOCAL calendar date (`getFullYear`/`getMonth`/`getDate` — not the UTC getters) — e.g. `localDateOnlyString(new Date())` for "today" in the viewer's own timezone. */
export function localDateOnlyString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export type ShipDateUrgency = 'overdue' | 'today' | 'soon' | 'normal';

export interface ShipDateInfo {
  /** "Today" / "Tomorrow" / "Aug 14" — never includes an "Overdue" prefix; combining that with completion state is a UI-level concern (see ShipByLine). */
  label: string;
  urgency: ShipDateUrgency;
  /** Negative = past. */
  daysUntil: number;
}

/**
 * Relative label + urgency bucket for a Ship By date. Both arguments must
 * be "YYYY-MM-DD" — `todayDateOnly` should come from `localDateOnlyString`
 * so "today" reflects the *viewer's* calendar day, not the server's.
 *
 * Urgency: negative days -> overdue; 0 -> today; 1-2 -> soon (the
 * "due within 2 days" warning window); 3+ -> normal.
 */
export function getShipDateInfo(shipByDate: string, todayDateOnly: string): ShipDateInfo {
  const target = parseDateOnly(shipByDate);
  const today = parseDateOnly(todayDateOnly);
  const daysUntil = dayIndex(target) - dayIndex(today);

  const urgency: ShipDateUrgency = daysUntil < 0 ? 'overdue' : daysUntil === 0 ? 'today' : daysUntil <= 2 ? 'soon' : 'normal';
  const label = daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : formatShipDateOnly(shipByDate);

  return { label, urgency, daysUntil };
}
