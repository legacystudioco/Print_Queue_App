import { describe, expect, it } from 'vitest';
import { summarizePlateCounts, summarizePlateTime } from './plateTime';
import type { PlateStatus } from './board';

function plate(status: PlateStatus, estimatedDurationSeconds: number | null) {
  return { status, estimatedDurationSeconds };
}

describe('summarizePlateTime', () => {
  it('buckets queued/printing plates as remaining and completed/partial plates as completed', () => {
    // queued 1h + printing 30m = 90m remaining; completed 2h + partial 15m = 135m completed
    const result = summarizePlateTime([
      plate('queued', 60 * 60),
      plate('printing', 30 * 60),
      plate('completed', 120 * 60),
      plate('partial', 15 * 60),
    ]);
    expect(result).toEqual({
      totalMinutes: 90 + 135,
      completedMinutes: 135,
      remainingMinutes: 90,
      missingCount: 0,
    });
  });

  it('never treats a missing estimate as zero — excludes it from every bucket and counts it separately', () => {
    const result = summarizePlateTime([plate('queued', null), plate('completed', 60 * 60)]);
    expect(result).toEqual({ totalMinutes: 60, completedMinutes: 60, remainingMinutes: 0, missingCount: 1 });
  });

  it('totalMinutes is always completedMinutes + remainingMinutes', () => {
    const result = summarizePlateTime([
      plate('queued', 45 * 60),
      plate('completed', 90 * 60),
      plate('partial', null),
    ]);
    expect(result.totalMinutes).toBe(result.completedMinutes + result.remainingMinutes);
    expect(result.missingCount).toBe(1);
  });

  it('returns all zeros for an empty plate list', () => {
    expect(summarizePlateTime([])).toEqual({
      totalMinutes: 0,
      completedMinutes: 0,
      remainingMinutes: 0,
      missingCount: 0,
    });
  });
});

describe('summarizePlateCounts', () => {
  it('counts completed and partial plates as done, queued/printing as not done', () => {
    const result = summarizePlateCounts([
      { status: 'completed' },
      { status: 'completed' },
      { status: 'partial' },
      { status: 'printing' },
      { status: 'queued' },
    ]);
    expect(result).toEqual({ total: 5, completed: 3 });
  });

  it('returns zero total for an empty plate list', () => {
    expect(summarizePlateCounts([])).toEqual({ total: 0, completed: 0 });
  });
});
