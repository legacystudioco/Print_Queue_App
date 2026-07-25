import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PrinterAdapterError, type PrinterAdapter } from '@print-queue/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleDeliverPrintCommand } from './deliverPrint.js';
import { createLogger } from '../logger.js';
import { createFakeSupabase } from '../testSupport/fakeSupabase.js';
import type { PrinterCommandsRow } from '../lib/database.types.js';

const JOB_ID = '11111111-1111-1111-1111-111111111111';
const PRINTER_ID = 'printer-1';
const COMMAND_ID = 'command-1';

const logger = createLogger('error');

function fakeAdapter(overrides: Partial<PrinterAdapter> = {}): PrinterAdapter {
  return {
    testConnection: async () => ({ connected: true }),
    getStatus: async () => ({ status: 'unknown' }),
    uploadPrintFile: async (input) => ({ remoteFileName: input.remoteFileName }),
    startPrint: async () => {
      throw new Error('deliver_print must never call startPrint()');
    },
    pausePrint: async () => {},
    resumePrint: async () => {},
    cancelPrint: async () => {},
    getCapabilities: () => ({
      canUploadFile: true,
      canStartPrint: true,
      canPause: true,
      canResume: true,
      canCancel: true,
      canReportProgress: true,
      canReportTemperatures: true,
      supportsDeliveryOnly: true,
    }),
    ...overrides,
  };
}

function seedTables() {
  return {
    print_jobs: [{ id: JOB_ID, status: 'command_pending' as const }],
    printer_commands: [{ id: COMMAND_ID, printer_id: PRINTER_ID, result: null }],
    printers: [{ id: PRINTER_ID, current_job_id: null }],
  };
}

function fakeCommand(): PrinterCommandsRow {
  return {
    id: COMMAND_ID,
    printer_id: PRINTER_ID,
    print_job_id: JOB_ID,
    command_type: 'deliver_print',
    status: 'processing',
    requested_by: 'user-1',
    requested_at: new Date().toISOString(),
    claimed_at: new Date().toISOString(),
    claimed_by_bridge: 'bridge-1',
    completed_at: null,
    error_message: null,
    attempt_count: 1,
    idempotency_key: 'idem-1',
    payload: { jobId: JOB_ID, storagePath: 'jobs/plate.gcode', originalFilename: 'plate.gcode' },
    result: null,
  };
}

let tempDirectory: string;

beforeEach(async () => {
  tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-deliver-print-test-'));
});

afterEach(async () => {
  await fs.rm(tempDirectory, { recursive: true, force: true });
});

describe('handleDeliverPrintCommand', () => {
  it('uploads the file and returns the job to ready, never calling startPrint', async () => {
    const { client, tables, setStorageFile } = createFakeSupabase(seedTables());
    setStorageFile('jobs/plate.gcode', 'fake gcode bytes');

    let uploadCalled = false;
    const adapter = fakeAdapter({
      uploadPrintFile: async (input) => {
        uploadCalled = true;
        return { remoteFileName: input.remoteFileName };
      },
    });

    await handleDeliverPrintCommand(client, adapter, logger, tempDirectory, fakeCommand());

    expect(uploadCalled).toBe(true);

    const job = tables.print_jobs.find((j) => j.id === JOB_ID);
    expect(job?.status).toBe('ready');

    const command = tables.printer_commands.find((c) => c.id === COMMAND_ID);
    expect(command?.result).toMatchObject({ remoteFileName: 'plate.gcode' });
    expect((command?.result as { uploadedAt?: string }).uploadedAt).toBeTruthy();

    // deliver_print never sets current_job_id — that only happens once a
    // real start_print command actually starts the print.
    const printer = tables.printers.find((p) => p.id === PRINTER_ID);
    expect(printer?.current_job_id).toBeNull();
  });

  it('a failed upload fails the job and never transitions it to ready', async () => {
    const { client, tables, setStorageFile } = createFakeSupabase(seedTables());
    setStorageFile('jobs/plate.gcode', 'fake gcode bytes');

    const adapter = fakeAdapter({
      uploadPrintFile: async () => {
        throw new PrinterAdapterError('upload_failed', 'FLASHFORGE_UNREACHABLE: could not reach printer');
      },
    });

    await expect(handleDeliverPrintCommand(client, adapter, logger, tempDirectory, fakeCommand())).rejects.toThrow(
      /FLASHFORGE_UNREACHABLE/,
    );

    const job = tables.print_jobs.find((j) => j.id === JOB_ID);
    expect(job?.status).toBe('failed');
    expect(job?.failure_message).toMatch(/FLASHFORGE_UNREACHABLE/);

    const command = tables.printer_commands.find((c) => c.id === COMMAND_ID);
    expect((command?.result as { deliveryFailureReason?: string })?.deliveryFailureReason).toMatch(
      /FLASHFORGE_UNREACHABLE/,
    );
  });

  it('a download failure fails the job and never calls uploadPrintFile', async () => {
    const { client, tables } = createFakeSupabase(seedTables());
    // Deliberately not calling setStorageFile — download() returns "not found".

    const adapter = fakeAdapter({
      uploadPrintFile: async () => {
        throw new Error('should never be called');
      },
    });

    await expect(handleDeliverPrintCommand(client, adapter, logger, tempDirectory, fakeCommand())).rejects.toThrow(
      /Failed to download/,
    );

    const job = tables.print_jobs.find((j) => j.id === JOB_ID);
    expect(job?.status).toBe('failed');
  });
});
