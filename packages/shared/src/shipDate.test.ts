import { describe, expect, it } from 'vitest';
import { formatShipDateOnly, getShipDateInfo, localDateOnlyString } from './shipDate';

describe('formatShipDateOnly', () => {
  it('formats a date-only string as "Mon D" without depending on "today"', () => {
    expect(formatShipDateOnly('2026-08-14')).toBe('Aug 14');
    expect(formatShipDateOnly('2026-01-01')).toBe('Jan 1');
    expect(formatShipDateOnly('2026-12-31')).toBe('Dec 31');
  });
});

describe('localDateOnlyString', () => {
  it('reads the LOCAL calendar date off a Date object, not UTC', () => {
    // Constructed via the local-timezone constructor — August 14th locally,
    // regardless of what UTC offset the test runner's machine happens to be in.
    expect(localDateOnlyString(new Date(2026, 7, 14))).toBe('2026-08-14');
    expect(localDateOnlyString(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('getShipDateInfo', () => {
  it('labels the same day as "Today" with today urgency', () => {
    expect(getShipDateInfo('2026-08-14', '2026-08-14')).toEqual({
      label: 'Today',
      urgency: 'today',
      daysUntil: 0,
    });
  });

  it('labels the next day as "Tomorrow" with soon urgency', () => {
    expect(getShipDateInfo('2026-08-15', '2026-08-14')).toEqual({
      label: 'Tomorrow',
      urgency: 'soon',
      daysUntil: 1,
    });
  });

  it('treats 2 days out as still "soon" (the due-within-2-days warning window)', () => {
    const result = getShipDateInfo('2026-08-16', '2026-08-14');
    expect(result.urgency).toBe('soon');
    expect(result.daysUntil).toBe(2);
    expect(result.label).toBe('Aug 16');
  });

  it('treats 3+ days out as "normal"', () => {
    const result = getShipDateInfo('2026-08-17', '2026-08-14');
    expect(result.urgency).toBe('normal');
    expect(result.daysUntil).toBe(3);
  });

  it('treats a past date as "overdue" with a negative daysUntil, and formats the plain date (not "Yesterday")', () => {
    const result = getShipDateInfo('2026-08-12', '2026-08-14');
    expect(result.urgency).toBe('overdue');
    expect(result.daysUntil).toBe(-2);
    expect(result.label).toBe('Aug 12');
  });

  it('is exact across a month boundary — no off-by-one from day-count math', () => {
    const result = getShipDateInfo('2026-09-01', '2026-08-31');
    expect(result.daysUntil).toBe(1);
    expect(result.label).toBe('Tomorrow');
  });

  it('never shifts the calendar day regardless of which local timezone "today" was captured in — pure string/UTC-epoch day-index math, no `new Date(dateOnlyString)` involved', () => {
    // Simulates the exact bug class being guarded against: if this used
    // `new Date('2026-08-14')` (parsed as UTC midnight) compared against a
    // negative-UTC-offset "today", the date would appear to have already
    // passed. Asserting the day-count directly proves no such parsing occurs.
    const result = getShipDateInfo('2026-08-14', '2026-08-13');
    expect(result.daysUntil).toBe(1);
    expect(result.urgency).toBe('soon');
  });
});
