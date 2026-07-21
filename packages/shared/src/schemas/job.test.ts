import { describe, expect, it } from 'vitest';
import { createPrintJobSchema, printFileNameSchema, sanitizeFileName } from './job';

const usedSlot = { isUsed: true, colorName: 'Orange', materialName: 'PLA', notes: null };
const unusedSlot = { isUsed: false, colorName: null, materialName: null, notes: null };

function baseJob(overrides: Partial<Parameters<typeof createPrintJobSchema.parse>[0]> = {}) {
  return {
    name: 'Dragon Sign',
    originalFilename: 'dragon.gcode.3mf',
    fileSizeBytes: 1_000_000,
    estimatedDurationSeconds: 3600,
    notes: null,
    externalSpoolConfirmed: false,
    amsSlots: [usedSlot, unusedSlot, unusedSlot, unusedSlot] as const,
    ...overrides,
  };
}

describe('printFileNameSchema', () => {
  it('accepts a .gcode.3mf filename', () => {
    expect(printFileNameSchema.safeParse('model.gcode.3mf').success).toBe(true);
  });

  it('rejects other extensions', () => {
    expect(printFileNameSchema.safeParse('model.stl').success).toBe(false);
    expect(printFileNameSchema.safeParse('model.3mf').success).toBe(false);
    expect(printFileNameSchema.safeParse('model.gcode').success).toBe(false);
  });
});

describe('sanitizeFileName', () => {
  it('strips path segments and unsafe characters', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('my file (final) v2.gcode.3mf')).toBe('my_file__final__v2.gcode.3mf');
  });
});

describe('createPrintJobSchema', () => {
  it('accepts a valid job with at least one used AMS slot', () => {
    const result = createPrintJobSchema.safeParse(baseJob());
    expect(result.success).toBe(true);
  });

  it('rejects a missing name', () => {
    const result = createPrintJobSchema.safeParse(baseJob({ name: '' }));
    expect(result.success).toBe(false);
  });

  it('rejects a non-.gcode.3mf file', () => {
    const result = createPrintJobSchema.safeParse(baseJob({ originalFilename: 'model.stl' }));
    expect(result.success).toBe(false);
  });

  it('rejects a file over the size limit', () => {
    const result = createPrintJobSchema.safeParse(
      baseJob({ fileSizeBytes: 600 * 1024 * 1024 }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects when no AMS slot is used and external spool is not confirmed', () => {
    const result = createPrintJobSchema.safeParse(
      baseJob({ amsSlots: [unusedSlot, unusedSlot, unusedSlot, unusedSlot] }),
    );
    expect(result.success).toBe(false);
  });

  it('allows no AMS slot used when external spool is explicitly confirmed', () => {
    const result = createPrintJobSchema.safeParse(
      baseJob({
        amsSlots: [unusedSlot, unusedSlot, unusedSlot, unusedSlot],
        externalSpoolConfirmed: true,
      }),
    );
    expect(result.success).toBe(true);
  });

  it('requires a color name for a slot marked as used', () => {
    const result = createPrintJobSchema.safeParse(
      baseJob({
        amsSlots: [
          { isUsed: true, colorName: '', materialName: null, notes: null },
          unusedSlot,
          unusedSlot,
          unusedSlot,
        ],
      }),
    );
    expect(result.success).toBe(false);
  });
});
