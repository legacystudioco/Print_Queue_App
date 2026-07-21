import { describe, expect, it } from 'vitest';
import { bedClearChecklistSchema, startNextJobSchema } from './job';

describe('bedClearChecklistSchema', () => {
  it('requires all three confirmations to be true', () => {
    expect(
      bedClearChecklistSchema.safeParse({
        previousPrintRemoved: true,
        buildPlateClear: true,
        amsVerified: true,
      }).success,
    ).toBe(true);
  });

  it('rejects when any single confirmation is missing', () => {
    expect(
      bedClearChecklistSchema.safeParse({
        previousPrintRemoved: true,
        buildPlateClear: false,
        amsVerified: true,
      }).success,
    ).toBe(false);

    expect(
      bedClearChecklistSchema.safeParse({
        previousPrintRemoved: true,
        buildPlateClear: true,
      }).success,
    ).toBe(false);
  });
});

describe('startNextJobSchema', () => {
  const validChecklist = {
    previousPrintRemoved: true,
    buildPlateClear: true,
    amsVerified: true,
  };

  it('accepts a valid start-next request', () => {
    const result = startNextJobSchema.safeParse({
      jobId: '11111111-1111-1111-1111-111111111111',
      idempotencyKey: '22222222-2222-2222-2222-222222222222',
      checklist: validChecklist,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-uuid jobId', () => {
    const result = startNextJobSchema.safeParse({
      jobId: 'not-a-uuid',
      idempotencyKey: '22222222-2222-2222-2222-222222222222',
      checklist: validChecklist,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an incomplete checklist', () => {
    const result = startNextJobSchema.safeParse({
      jobId: '11111111-1111-1111-1111-111111111111',
      idempotencyKey: '22222222-2222-2222-2222-222222222222',
      checklist: { previousPrintRemoved: true, buildPlateClear: true, amsVerified: false },
    });
    expect(result.success).toBe(false);
  });
});
