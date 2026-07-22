import { describe, expect, it } from 'vitest';
import { DATE_TIME, formatDateTime, TIME_WITH_SECONDS } from './dateTime';

// The exact scenario that motivated this fix: a printer heartbeat recorded
// as 2026-07-22T21:48:00Z (Postgres `timestamptz` -> PostgREST ISO 8601
// with a Z suffix) is 5:48 PM in America/New_York (EDT, UTC-4) that day —
// not 9:48 PM, which is what you get by formatting it in UTC instead of
// the visitor's own timezone.
const HEARTBEAT_Z = '2026-07-22T21:48:00Z';
// PostgREST/postgres-js actually emit a numeric offset, not a literal "Z" —
// both describe the same instant and must parse identically.
const HEARTBEAT_OFFSET = '2026-07-22T21:48:00+00:00';

// hourCycle: 'h23' + '2-digit' fields keep assertions locale-agnostic (no
// AM/PM wording or 12- vs 24-hour default to worry about across machines).
const H23 = { hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' } as const;

describe('formatDateTime', () => {
  it('parses a Z-suffixed ISO timestamp as the correct absolute instant', () => {
    expect(formatDateTime(HEARTBEAT_Z, { ...H23, timeZone: 'UTC' })).toBe('21:48:00');
  });

  it('parses a PostgREST-style numeric-offset timestamp identically to a Z-suffixed one', () => {
    expect(formatDateTime(HEARTBEAT_OFFSET, { ...H23, timeZone: 'UTC' })).toBe(
      formatDateTime(HEARTBEAT_Z, { ...H23, timeZone: 'UTC' }),
    );
  });

  it('formats the same instant differently per timezone — proving no timezone is hardcoded', () => {
    const utc = formatDateTime(HEARTBEAT_Z, { ...H23, timeZone: 'UTC' });
    const newYork = formatDateTime(HEARTBEAT_Z, { ...H23, timeZone: 'America/New_York' });
    const tokyo = formatDateTime(HEARTBEAT_Z, { ...H23, timeZone: 'Asia/Tokyo' });

    expect(utc).toBe('21:48:00');
    expect(newYork).toBe('17:48:00'); // the reported bug: dashboard was showing '21:48:00' instead
    expect(tokyo).toBe('06:48:00'); // UTC+9, rolls into the next day
    expect(new Set([utc, newYork, tokyo]).size).toBe(3);
  });

  it('reproduces the reported bug: UTC and America/New_York must disagree for the same instant', () => {
    const local = formatDateTime(HEARTBEAT_Z, {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/New_York',
    });
    const utc = formatDateTime(HEARTBEAT_Z, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
    expect(local).not.toBe(utc);
  });

  it('returns null for a missing timestamp', () => {
    expect(formatDateTime(null)).toBeNull();
    expect(formatDateTime(undefined)).toBeNull();
  });

  it('returns null for an invalid timestamp instead of throwing or returning "Invalid Date"', () => {
    expect(formatDateTime('not-a-real-timestamp')).toBeNull();
    expect(formatDateTime('')).toBeNull();
  });

  it('defaults to DATE_TIME (date + time) when no options are passed', () => {
    const result = formatDateTime(HEARTBEAT_Z);
    expect(result).not.toBeNull();
    expect(result).toMatch(/2026/); // date portion present, not just a bare time
  });

  it('TIME_WITH_SECONDS includes hour, minute, and second', () => {
    expect(TIME_WITH_SECONDS).toMatchObject({ hour: 'numeric', minute: '2-digit', second: '2-digit' });
  });

  it('DATE_TIME includes a full date plus hour, minute, and second', () => {
    expect(DATE_TIME).toMatchObject({
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    });
  });
});
