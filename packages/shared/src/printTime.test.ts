import { describe, expect, it } from 'vitest';
import { formatPrintTime, hoursMinutesToMinutes, minutesToHoursMinutes } from './printTime';

describe('minutesToHoursMinutes', () => {
  it('splits total minutes into hours and leftover minutes', () => {
    expect(minutesToHoursMinutes(225)).toEqual({ hours: 3, minutes: 45 });
    expect(minutesToHoursMinutes(62)).toEqual({ hours: 1, minutes: 2 });
    expect(minutesToHoursMinutes(480)).toEqual({ hours: 8, minutes: 0 });
    expect(minutesToHoursMinutes(35)).toEqual({ hours: 0, minutes: 35 });
    expect(minutesToHoursMinutes(0)).toEqual({ hours: 0, minutes: 0 });
  });

  it('rounds fractional input and clamps negative input to zero', () => {
    expect(minutesToHoursMinutes(90.4)).toEqual({ hours: 1, minutes: 30 });
    expect(minutesToHoursMinutes(-10)).toEqual({ hours: 0, minutes: 0 });
  });
});

describe('hoursMinutesToMinutes', () => {
  it('combines hours and minutes into a total minute count', () => {
    expect(hoursMinutesToMinutes(3, 45)).toBe(225);
    expect(hoursMinutesToMinutes(2, 0)).toBe(120);
    expect(hoursMinutesToMinutes(0, 35)).toBe(35);
    expect(hoursMinutesToMinutes(10, 15)).toBe(615);
  });

  it('is the exact inverse of minutesToHoursMinutes for any non-negative total', () => {
    for (const total of [0, 1, 35, 59, 60, 61, 225, 480, 615, 59999]) {
      const { hours, minutes } = minutesToHoursMinutes(total);
      expect(hoursMinutesToMinutes(hours, minutes)).toBe(total);
    }
  });

  it('clamps negative hours/minutes to zero rather than going negative', () => {
    expect(hoursMinutesToMinutes(-1, 30)).toBe(30);
    expect(hoursMinutesToMinutes(2, -10)).toBe(120);
  });
});

describe('formatPrintTime', () => {
  it('formats minutes-only durations without a redundant "0h"', () => {
    expect(formatPrintTime(45)).toBe('45m');
  });

  it('formats mixed hour-and-minute durations', () => {
    expect(formatPrintTime(90)).toBe('1h 30m');
    expect(formatPrintTime(245)).toBe('4h 5m');
  });

  it('formats exact-hour durations without a redundant "0m"', () => {
    expect(formatPrintTime(180)).toBe('3h');
    expect(formatPrintTime(1440)).toBe('24h');
  });

  it('formats zero as "0m"', () => {
    expect(formatPrintTime(0)).toBe('0m');
  });
});
