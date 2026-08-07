import { describe, expect, it } from 'vitest';
import { createJobSchema, groupJobsSchema, MAX_PLATES_PER_JOB, moveJobIntoJobSchema, plateInputSchema } from './job-plate';

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

function groupPayload(overrides: Partial<Parameters<typeof groupJobsSchema.parse>[0]> = {}) {
  return {
    jobId: crypto.randomUUID(),
    customerName: 'Hug',
    business: '3d_sports_displays' as const,
    notes: null,
    sourceJobIds: [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()],
    ...overrides,
  };
}

describe('groupJobsSchema', () => {
  it('accepts a job id, customer name, business, and one or more source job ids', () => {
    expect(groupJobsSchema.safeParse(groupPayload()).success).toBe(true);
  });

  it('accepts a single source job id', () => {
    expect(groupJobsSchema.safeParse(groupPayload({ sourceJobIds: [crypto.randomUUID()] })).success).toBe(true);
  });

  it('rejects zero source job ids', () => {
    expect(groupJobsSchema.safeParse(groupPayload({ sourceJobIds: [] })).success).toBe(false);
  });

  it('rejects a non-uuid source job id', () => {
    expect(groupJobsSchema.safeParse(groupPayload({ sourceJobIds: ['not-a-uuid'] })).success).toBe(false);
  });

  it('rejects an empty customer name', () => {
    expect(groupJobsSchema.safeParse(groupPayload({ customerName: '' })).success).toBe(false);
  });
});

describe('moveJobIntoJobSchema', () => {
  it('accepts a target job id', () => {
    expect(moveJobIntoJobSchema.safeParse({ targetJobId: crypto.randomUUID() }).success).toBe(true);
  });

  it('rejects a missing target job id', () => {
    expect(moveJobIntoJobSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a non-uuid target job id', () => {
    expect(moveJobIntoJobSchema.safeParse({ targetJobId: 'not-a-uuid' }).success).toBe(false);
  });
});
