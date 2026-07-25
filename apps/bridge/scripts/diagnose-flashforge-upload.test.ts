import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runUploadDiagnostic, validateArgs, type UploadOnlyAdapter } from './diagnose-flashforge-upload.js';

/**
 * A spy adapter that exposes startPrint/printGcode-shaped methods (beyond
 * what UploadOnlyAdapter's type requires) purely so a test can assert they
 * are never called — proving at runtime, not just by type signature, that
 * the upload-only diagnostic never starts a print.
 */
function spyAdapter(overrides: Partial<UploadOnlyAdapter> = {}) {
  const calls = { startPrint: 0, printGcode: 0 };
  let lastUploadedFileName: string | null = null;
  const adapter: UploadOnlyAdapter & { startPrint: () => void; printGcode: () => void } = {
    testConnection: async () => ({ connected: true }),
    uploadPrintFile: async (input) => {
      lastUploadedFileName = input.remoteFileName;
      return { remoteFileName: input.remoteFileName };
    },
    listRemoteFiles: async () => (lastUploadedFileName ? [lastUploadedFileName] : []),
    startPrint: () => {
      calls.startPrint += 1;
      throw new Error('runUploadDiagnostic must never call startPrint');
    },
    printGcode: () => {
      calls.printGcode += 1;
      throw new Error('runUploadDiagnostic must never call printGcode');
    },
    ...overrides,
  };
  return { adapter, calls };
}

let tempFile: string;

beforeEach(async () => {
  tempFile = path.join(os.tmpdir(), `diagnose-upload-test-${Date.now()}.gcode`);
  await fs.writeFile(tempFile, 'G28\n');
});

afterEach(async () => {
  await fs.rm(tempFile, { force: true });
});

describe('runUploadDiagnostic', () => {
  it('never calls startPrint or printGcode on a successful run', async () => {
    const { adapter, calls } = spyAdapter();
    const lines: string[] = [];

    const outcome = await runUploadDiagnostic(adapter, tempFile, (line) => lines.push(line));

    expect(outcome).toEqual({ ok: true, remoteFileName: path.basename(tempFile) });
    expect(calls.startPrint).toBe(0);
    expect(calls.printGcode).toBe(0);
  });

  it('prints the "UPLOAD ONLY — WILL NOT START" banner', async () => {
    const { adapter } = spyAdapter();
    const lines: string[] = [];

    await runUploadDiagnostic(adapter, tempFile, (line) => lines.push(line));

    expect(lines.some((l) => l.includes('UPLOAD ONLY') && l.includes('WILL NOT START'))).toBe(true);
  });

  it('never calls startPrint/printGcode even when the connection fails', async () => {
    const { adapter, calls } = spyAdapter({
      testConnection: async () => ({ connected: false, message: 'simulated unreachable' }),
    });

    const outcome = await runUploadDiagnostic(adapter, tempFile, () => {});

    expect(outcome).toMatchObject({ ok: false, reason: 'connection_failed' });
    expect(calls.startPrint).toBe(0);
    expect(calls.printGcode).toBe(0);
  });

  it('never calls startPrint/printGcode and reports failure when the printer file list does not confirm the upload', async () => {
    const { adapter, calls } = spyAdapter({ listRemoteFiles: async () => [] });

    const outcome = await runUploadDiagnostic(adapter, tempFile, () => {});

    expect(outcome).toMatchObject({ ok: false, reason: 'upload_unconfirmed' });
    expect(calls.startPrint).toBe(0);
    expect(calls.printGcode).toBe(0);
  });

  it('exits (reports failure) nonzero-equivalent when upload confirmation fails, distinct from a connection failure', async () => {
    const { adapter } = spyAdapter({ listRemoteFiles: async () => ['someone-elses-file.gcode'] });

    const outcome = await runUploadDiagnostic(adapter, tempFile, () => {});

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe('upload_unconfirmed');
    }
  });
});

describe('validateArgs', () => {
  it('rejects when --confirm-upload is missing', () => {
    expect(validateArgs(['/tmp/x.gcode'])).toEqual({
      error: 'Refusing to upload: missing required --confirm-upload flag.',
    });
  });

  it('rejects when no file path is given', () => {
    expect(validateArgs(['--confirm-upload'])).toEqual({ error: 'Missing local .gcode file path.' });
  });

  it('rejects a non-.gcode file', () => {
    const result = validateArgs(['/tmp/plate.3mf', '--confirm-upload']);
    expect('error' in result && result.error).toContain('.gcode extension');
  });

  it('accepts a valid invocation regardless of flag position', () => {
    expect(validateArgs(['--confirm-upload', '/tmp/plate.gcode'])).toEqual({ filePath: '/tmp/plate.gcode' });
    expect(validateArgs(['/tmp/plate.gcode', '--confirm-upload'])).toEqual({ filePath: '/tmp/plate.gcode' });
  });
});
