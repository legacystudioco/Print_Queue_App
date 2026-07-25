import { describe, expect, it } from 'vitest';
import { createPrintJobSchema, printFileNameSchema, sanitizeFileName } from './job';

const usedSlot = { isUsed: true, colorName: 'Orange', materialName: 'PLA', notes: null };
const unusedSlot = { isUsed: false, colorName: null, materialName: null, notes: null };

const PRINTER_ID = '00000000-0000-0000-0000-000000000001';

function bambuFile(overrides: Partial<{ filename: string; fileSizeBytes: number }> = {}) {
  return {
    printerBrand: 'bambu' as const,
    filename: overrides.filename ?? 'dragon.gcode.3mf',
    fileSizeBytes: overrides.fileSizeBytes ?? 1_000_000,
    storagePath: 'bambu/job-1/dragon.gcode.3mf',
  };
}

function snapmakerFile() {
  return {
    printerBrand: 'snapmaker' as const,
    filename: 'dragon.gcode',
    fileSizeBytes: 1_000_000,
    storagePath: 'snapmaker/job-1/dragon.gcode',
  };
}

function baseJob(overrides: Partial<Parameters<typeof createPrintJobSchema.parse>[0]> = {}) {
  return {
    name: 'Dragon Sign',
    printerId: PRINTER_ID,
    files: [bambuFile()],
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
  it('accepts a valid Bambu-only job with at least one used AMS slot', () => {
    const result = createPrintJobSchema.safeParse(baseJob());
    expect(result.success).toBe(true);
  });

  it('rejects a missing name', () => {
    const result = createPrintJobSchema.safeParse(baseJob({ name: '' }));
    expect(result.success).toBe(false);
  });

  it('rejects when no files are provided', () => {
    const result = createPrintJobSchema.safeParse(baseJob({ files: [] }));
    expect(result.success).toBe(false);
  });

  it('rejects a Bambu file with the wrong extension', () => {
    const result = createPrintJobSchema.safeParse(
      baseJob({ files: [bambuFile({ filename: 'model.stl' })] }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a file over the size limit', () => {
    const result = createPrintJobSchema.safeParse(
      baseJob({ files: [bambuFile({ fileSizeBytes: 600 * 1024 * 1024 })] }),
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

  it('requires AMS slots when a Bambu file is included', () => {
    const { amsSlots: _amsSlots, ...rest } = baseJob();
    const result = createPrintJobSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('accepts a Snapmaker-only job with no AMS slots', () => {
    const { amsSlots: _amsSlots, ...rest } = baseJob({ files: [snapmakerFile()] });
    const result = createPrintJobSchema.safeParse(rest);
    expect(result.success).toBe(true);
  });

  it('rejects AMS slots on a non-Bambu-only job', () => {
    const result = createPrintJobSchema.safeParse(baseJob({ files: [snapmakerFile()] }));
    expect(result.success).toBe(false);
  });

  it('accepts a job with both a Bambu and a Snapmaker file', () => {
    const result = createPrintJobSchema.safeParse(
      baseJob({ files: [bambuFile(), snapmakerFile()] }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects two files for the same brand', () => {
    const result = createPrintJobSchema.safeParse(
      baseJob({ files: [bambuFile(), bambuFile({ filename: 'other.gcode.3mf' })] }),
    );
    expect(result.success).toBe(false);
  });
});
