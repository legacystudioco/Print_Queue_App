import { describe, expect, it } from 'vitest';
import { isWaitingQueueJob, summarizePrintTime } from './queueTime';

function job(estimatedDurationSeconds: number | null) {
  return { estimatedDurationSeconds };
}

describe('isWaitingQueueJob', () => {
  it('is true for queued and ready jobs', () => {
    expect(isWaitingQueueJob('queued')).toBe(true);
    expect(isWaitingQueueJob('ready')).toBe(true);
  });

  it('is false for the actively-printing job and every other status', () => {
    expect(isWaitingQueueJob('printing')).toBe(false);
    expect(isWaitingQueueJob('command_pending')).toBe(false);
    expect(isWaitingQueueJob('downloading')).toBe(false);
    expect(isWaitingQueueJob('uploading_to_printer')).toBe(false);
    expect(isWaitingQueueJob('starting')).toBe(false);
    expect(isWaitingQueueJob('completed')).toBe(false);
    expect(isWaitingQueueJob('failed')).toBe(false);
    expect(isWaitingQueueJob('skipped')).toBe(false);
    expect(isWaitingQueueJob('cancelled')).toBe(false);
    expect(isWaitingQueueJob('uploaded')).toBe(false);
  });
});

describe('summarizePrintTime', () => {
  it('sums minutes across jobs that all have an estimate', () => {
    // 3h15m + 45m + 2h = 195 + 45 + 120 = 360 minutes = 6h
    const result = summarizePrintTime([job(195 * 60), job(45 * 60), job(120 * 60)]);
    expect(result).toEqual({ totalMinutes: 360, missingCount: 0 });
  });

  it('excludes jobs with no estimate from the sum and counts them separately', () => {
    const result = summarizePrintTime([job(60 * 60), job(null), job(30 * 60), job(null)]);
    expect(result).toEqual({ totalMinutes: 90, missingCount: 2 });
  });

  it('never treats a missing estimate as zero minutes', () => {
    const withMissing = summarizePrintTime([job(null)]);
    const empty = summarizePrintTime([]);
    expect(withMissing.totalMinutes).toBe(0);
    expect(withMissing.missingCount).toBe(1);
    expect(empty).toEqual({ totalMinutes: 0, missingCount: 0 });
  });

  it('returns zero total and zero missing for an empty list', () => {
    expect(summarizePrintTime([])).toEqual({ totalMinutes: 0, missingCount: 0 });
  });

  it('rounds fractional seconds-to-minutes conversions consistently', () => {
    // 90 seconds -> 1.5 -> rounds to 2 minutes (Math.round), matching every other seconds/60 display site.
    const result = summarizePrintTime([job(90)]);
    expect(result.totalMinutes).toBe(2);
  });
});
