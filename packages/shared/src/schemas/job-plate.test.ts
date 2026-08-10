import { describe, expect, it } from 'vitest';
import {
  createJobSchema,
  groupJobsSchema,
  MAX_PLATES_PER_JOB,
  moveJobIntoJobSchema,
  plateInputSchema,
  updateJobSchema,
} from './job-plate';

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

describe('createJobSchema — shipByDate', () => {
  it('accepts a job created without a Ship By date (omitted entirely)', () => {
    expect(createJobSchema.safeParse(job([plate()])).success).toBe(true);
  });

  it('accepts a job created with a Ship By date', () => {
    const result = createJobSchema.safeParse({ ...job([plate()]), shipByDate: '2026-08-14' });
    expect(result.success).toBe(true);
  });

  it('accepts today and past dates — there is no minimum-date constraint', () => {
    expect(createJobSchema.safeParse({ ...job([plate()]), shipByDate: '2020-01-01' }).success).toBe(true);
  });

  it('accepts an explicit null (no deadline)', () => {
    expect(createJobSchema.safeParse({ ...job([plate()]), shipByDate: null }).success).toBe(true);
  });

  it('rejects a malformed date string', () => {
    expect(createJobSchema.safeParse({ ...job([plate()]), shipByDate: '08/14/2026' }).success).toBe(false);
    expect(createJobSchema.safeParse({ ...job([plate()]), shipByDate: 'not a date' }).success).toBe(false);
  });
});

describe('updateJobSchema — shipByDate', () => {
  it('accepts setting a Ship By date', () => {
    expect(updateJobSchema.safeParse({ shipByDate: '2026-08-14' }).success).toBe(true);
  });

  it('accepts explicitly clearing it via null', () => {
    expect(updateJobSchema.safeParse({ shipByDate: null }).success).toBe(true);
  });

  it('treats an omitted shipByDate as "leave unchanged" — still a valid payload on its own', () => {
    expect(updateJobSchema.safeParse({ customerName: 'Jane Smith' }).success).toBe(true);
  });

  it('rejects a malformed date string', () => {
    expect(updateJobSchema.safeParse({ shipByDate: 'Aug 14' }).success).toBe(false);
  });
});
