import { describe, expect, it } from 'vitest';
import { deriveJobStatus, type PlateStatus } from './board';

describe('deriveJobStatus', () => {
  it('is queued when every plate is queued', () => {
    expect(deriveJobStatus(['queued'])).toBe('queued');
    expect(deriveJobStatus(['queued', 'queued', 'queued'])).toBe('queued');
  });

  it('is printing when at least one plate is printing and none are partial', () => {
    expect(deriveJobStatus(['printing'])).toBe('printing');
    expect(deriveJobStatus(['queued', 'printing'])).toBe('printing');
    expect(deriveJobStatus(['completed', 'printing', 'queued'])).toBe('printing');
  });

  it('is in_progress when some plates are completed and others are still queued, with none printing or partial', () => {
    expect(deriveJobStatus(['completed', 'queued'])).toBe('in_progress');
    expect(deriveJobStatus(['completed', 'completed', 'queued'])).toBe('in_progress');
  });

  it('is completed only when every plate is completed', () => {
    expect(deriveJobStatus(['completed'])).toBe('completed');
    expect(deriveJobStatus(['completed', 'completed', 'completed'])).toBe('completed');
  });

  it('is partial whenever any plate is partial, regardless of the other plates — partial always wins', () => {
    const casesWherePartialWins: PlateStatus[][] = [
      ['partial'],
      ['partial', 'queued'],
      ['partial', 'printing'],
      ['partial', 'completed'],
      ['partial', 'completed', 'queued', 'printing'],
      ['completed', 'completed', 'partial'],
    ];
    for (const plates of casesWherePartialWins) {
      expect(deriveJobStatus(plates)).toBe('partial');
    }
  });

  it('throws for an empty plate list — a job must always have at least one plate', () => {
    expect(() => deriveJobStatus([])).toThrow();
  });
});
