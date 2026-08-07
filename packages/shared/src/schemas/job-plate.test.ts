import { describe, expect, it } from 'vitest';
import { createJobSchema, MAX_PLATES_PER_JOB, plateInputSchema } from './job-plate';

function plate(overrides: Partial<Parameters<typeof plateInputSchema.parse>[0]> = {}) {
  return {
    id: crypto.randomUUID(),
    plateName: 'Base',
    screenshotPath: 'plate-id/screenshot.png',
    colors: null,
    estimatedDurationSeconds: null,
    notes: null,
    ...overrides,
  };
}

function job(plates: ReturnType<typeof plate>[]) {
  return {
    customerName: 'John Smith',
    business: '3d_sports_displays' as const,
    notes: null,
    plates,
  };
}

describe('createJobSchema', () => {
  it('accepts a job with exactly one plate', () => {
    expect(createJobSchema.safeParse(job([plate()])).success).toBe(true);
  });

  it('accepts a job with the maximum of 20 plates', () => {
    const plates = Array.from({ length: MAX_PLATES_PER_JOB }, () => plate());
    expect(createJobSchema.safeParse(job(plates)).success).toBe(true);
  });

  it('rejects a job with zero plates', () => {
    expect(createJobSchema.safeParse(job([])).success).toBe(false);
  });

  it('rejects a job with more than 20 plates', () => {
    const plates = Array.from({ length: MAX_PLATES_PER_JOB + 1 }, () => plate());
    expect(createJobSchema.safeParse(job(plates)).success).toBe(false);
  });

  it('rejects a plate with no screenshot', () => {
    expect(createJobSchema.safeParse(job([plate({ screenshotPath: '' })])).success).toBe(false);
  });

  it('rejects a job with no customer name', () => {
    expect(createJobSchema.safeParse({ ...job([plate()]), customerName: '' }).success).toBe(false);
  });
});
