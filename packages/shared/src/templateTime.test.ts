import { describe, expect, it } from 'vitest';
import { sumTemplatePlateSeconds } from './templateTime';

function plate(estimatedDurationSeconds: number | null) {
  return { estimatedDurationSeconds };
}

describe('sumTemplatePlateSeconds', () => {
  it('sums every plate estimate into total minutes', () => {
    const result = sumTemplatePlateSeconds([plate(60 * 60), plate(30 * 60), plate(90 * 60)]);
    expect(result).toEqual({ totalMinutes: 180, missingCount: 0 });
  });

  it('never treats a missing estimate as zero — excludes it from the total and counts it separately', () => {
    const result = sumTemplatePlateSeconds([plate(null), plate(60 * 60), plate(null)]);
    expect(result).toEqual({ totalMinutes: 60, missingCount: 2 });
  });

  it('returns zero total for an empty template', () => {
    expect(sumTemplatePlateSeconds([])).toEqual({ totalMinutes: 0, missingCount: 0 });
  });
});
