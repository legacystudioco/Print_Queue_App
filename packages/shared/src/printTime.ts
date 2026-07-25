/**
 * Print time is stored and passed around as a single total-minutes number
 * everywhere except the two-field Hours/Minutes UI (see
 * apps/web/src/components/job/PrintTimeFields.tsx) and the
 * `estimated_duration_seconds` column it's ultimately persisted in — that
 * seconds conversion happens at the DB boundary only (`* 60` / `/ 60`),
 * never here. These three functions are the one place hours/minutes math
 * happens, so every screen that shows or edits a print time agrees with
 * every other one.
 */

/** e.g. 225 -> { hours: 3, minutes: 45 }. Negative/fractional input is clamped/rounded to a valid total first. */
export function minutesToHoursMinutes(totalMinutes: number): { hours: number; minutes: number } {
  const safeTotal = Math.max(0, Math.round(totalMinutes));
  return { hours: Math.floor(safeTotal / 60), minutes: safeTotal % 60 };
}

/** e.g. (3, 45) -> 225. Inverse of minutesToHoursMinutes. */
export function hoursMinutesToMinutes(hours: number, minutes: number): number {
  return Math.max(0, Math.round(hours)) * 60 + Math.max(0, Math.round(minutes));
}

/**
 * Human-friendly print time, e.g. 245 -> "4h 5m", 180 -> "3h", 45 -> "45m".
 * Never shows a redundant "0h" or "0m" segment.
 */
export function formatPrintTime(totalMinutes: number): string {
  const { hours, minutes } = minutesToHoursMinutes(totalMinutes);
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}
