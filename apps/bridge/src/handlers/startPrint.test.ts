import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PrinterAdapterError,
  type PrinterAdapter,
  type StartPrintInput,
  type StartPrintResult,
} from '@print-queue/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleStartPrintCommand } from './startPrint.js';
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
    startPrint: async () => ({ started: true }),
    pausePrint: async () => {},
    resumePrint: async () => {},
    cancelPrint: async () => {},
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
    command_type: 'start_print',
    status: 'processing',
    requested_by: 'user-1',
    requested_at: new Date().toISOString(),
    claimed_at: new Date().toISOString(),
    claimed_by_bridge: 'bridge-1',
    completed_at: null,
    error_message: null,
    attempt_count: 1,
    idempotency_key: 'idem-1',
    payload: { jobId: JOB_ID, storagePath: 'jobs/plate.gcode.3mf', originalFilename: 'plate.gcode.3mf' },
    result: null,
  };
}

let tempDirectory: string;

beforeEach(async () => {
  tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-start-print-test-'));
});

afterEach(async () => {
  await fs.rm(tempDirectory, { recursive: true, force: true });
});

describe('handleStartPrintCommand', () => {
  it('manual mode: uploads and marks manual-start-required without publishing MQTT', async () => {
    const { client, tables, setStorageFile } = createFakeSupabase(seedTables());
    setStorageFile('jobs/plate.gcode.3mf', 'fake 3mf bytes');

    let startPrintCalled = false;
    const adapter = fakeAdapter({
      startPrint: async () => {
        startPrintCalled = true;
        return { started: true };
      },
    });

    await handleStartPrintCommand(client, adapter, logger, tempDirectory, fakeCommand(), 'manual');

    expect(startPrintCalled).toBe(false);

    const job = tables.print_jobs.find((j) => j.id === JOB_ID);
    expect(job?.status).toBe('printing');

    const command = tables.printer_commands.find((c) => c.id === COMMAND_ID);
    expect(command?.result).toMatchObject({
      remoteFileName: 'plate.gcode.3mf',
      startMode: 'manual',
      autoStartAttempted: false,
      autoStartSucceeded: false,
      manualStartRequired: true,
      message: 'File uploaded to the printer. Open Bambu Handy or Bambu Studio and start the print manually.',
    });
    expect((command?.result as { uploadedAt?: string }).uploadedAt).toBeTruthy();

    const printer = tables.printers.find((p) => p.id === PRINTER_ID);
    expect(printer?.current_job_id).toBe(JOB_ID);
  });

  it('auto mode: a rejected start command still fails the job (unchanged behavior)', async () => {
    const { client, tables, setStorageFile } = createFakeSupabase(seedTables());
    setStorageFile('jobs/plate.gcode.3mf', 'fake 3mf bytes');

    const adapter = fakeAdapter({
      startPrint: async (): Promise<StartPrintResult> => ({
        started: false,
        message: 'MQTT Command verification failed.',
      }),
    });

    await expect(
      handleStartPrintCommand(client, adapter, logger, tempDirectory, fakeCommand(), 'auto'),
    ).rejects.toThrow(/MQTT Command verification failed/);

    const job = tables.print_jobs.find((j) => j.id === JOB_ID);
    expect(job?.status).toBe('failed');
    expect(job?.failure_message).toMatch(/MQTT Command verification failed/);

    const command = tables.printer_commands.find((c) => c.id === COMMAND_ID);
    expect(command?.result).toMatchObject({
      startMode: 'auto',
      autoStartAttempted: true,
      autoStartSucceeded: false,
      manualStartRequired: false,
      startFailureReason: 'MQTT Command verification failed.',
    });
  });

  it('auto_with_manual_fallback: an ACS-style rejection (started: false) becomes a manual-start success', async () => {
    const { client, tables, setStorageFile } = createFakeSupabase(seedTables());
    setStorageFile('jobs/plate.gcode.3mf', 'fake 3mf bytes');

    const adapter = fakeAdapter({
      startPrint: async (): Promise<StartPrintResult> => ({
        started: false,
        message: 'MQTT Command verification failed.',
      }),
    });

    await handleStartPrintCommand(
      client,
      adapter,
      logger,
      tempDirectory,
      fakeCommand(),
      'auto_with_manual_fallback',
    );

    const job = tables.print_jobs.find((j) => j.id === JOB_ID);
    expect(job?.status).toBe('printing');
    expect(job?.status).not.toBe('failed');

    const command = tables.printer_commands.find((c) => c.id === COMMAND_ID);
    expect(command?.result).toMatchObject({
      startMode: 'auto_with_manual_fallback',
      autoStartAttempted: true,
      autoStartSucceeded: false,
      manualStartRequired: true,
      startFailureReason: 'MQTT Command verification failed.',
      message:
        'File uploaded successfully, but the printer did not start automatically. Open Bambu Handy or Bambu Studio and start it manually.',
    });

    const printer = tables.printers.find((p) => p.id === PRINTER_ID);
    expect(printer?.current_job_id).toBe(JOB_ID);
  });

  it('auto_with_manual_fallback: a timeout (thrown error) after successful upload also becomes a manual-start success', async () => {
    const { client, tables, setStorageFile } = createFakeSupabase(seedTables());
    setStorageFile('jobs/plate.gcode.3mf', 'fake 3mf bytes');

    const adapter = fakeAdapter({
      startPrint: async (_input: StartPrintInput) => {
        throw new PrinterAdapterError('start_failed', 'Timed out waiting for the printer to acknowledge the start command');
      },
    });

    await handleStartPrintCommand(
      client,
      adapter,
      logger,
      tempDirectory,
      fakeCommand(),
      'auto_with_manual_fallback',
    );

    const job = tables.print_jobs.find((j) => j.id === JOB_ID);
    expect(job?.status).toBe('printing');

    const command = tables.printer_commands.find((c) => c.id === COMMAND_ID);
    expect(command?.result).toMatchObject({
      autoStartAttempted: true,
      autoStartSucceeded: false,
      manualStartRequired: true,
      startFailureReason: 'Timed out waiting for the printer to acknowledge the start command',
    });
  });

  it('upload failure remains a hard failure in every mode, including manual', async () => {
    const { client, tables, setStorageFile } = createFakeSupabase(seedTables());
    setStorageFile('jobs/plate.gcode.3mf', 'fake 3mf bytes');

    const adapter = fakeAdapter({
      uploadPrintFile: async () => {
        throw new PrinterAdapterError('upload_failed', 'FTPS connection refused');
      },
    });

    await expect(
      handleStartPrintCommand(client, adapter, logger, tempDirectory, fakeCommand(), 'manual'),
    ).rejects.toThrow(/FTPS connection refused/);

    const job = tables.print_jobs.find((j) => j.id === JOB_ID);
    expect(job?.status).toBe('failed');
    expect(job?.failure_message).toMatch(/FTPS connection refused/);

    const command = tables.printer_commands.find((c) => c.id === COMMAND_ID);
    const result = command?.result as Record<string, unknown>;
    expect(result).toMatchObject({
      autoStartAttempted: false,
      autoStartSucceeded: false,
      manualStartRequired: false,
      startFailureReason: 'FTPS connection refused',
    });
    // No remoteFileName/uploadedAt — this is exactly how the UI tells a
    // pre-upload failure apart from a post-upload one.
    expect(result.remoteFileName).toBeUndefined();
    expect(result.uploadedAt).toBeUndefined();
  });

  it('download failure remains a hard failure and never reaches the upload/start stage', async () => {
    const { client, tables } = createFakeSupabase(seedTables());
    // Deliberately not calling setStorageFile — download() returns "not found".

    const adapter = fakeAdapter({
      uploadPrintFile: async () => {
        throw new Error('should never be called');
      },
    });

    await expect(
      handleStartPrintCommand(client, adapter, logger, tempDirectory, fakeCommand(), 'auto_with_manual_fallback'),
    ).rejects.toThrow(/Failed to download/);

    const job = tables.print_jobs.find((j) => j.id === JOB_ID);
    expect(job?.status).toBe('failed');
  });

  it('successful auto-start remains a normal success', async () => {
    const { client, tables, setStorageFile } = createFakeSupabase(seedTables());
    setStorageFile('jobs/plate.gcode.3mf', 'fake 3mf bytes');

    const adapter = fakeAdapter({ startPrint: async () => ({ started: true }) });

    await handleStartPrintCommand(client, adapter, logger, tempDirectory, fakeCommand(), 'auto');

    const job = tables.print_jobs.find((j) => j.id === JOB_ID);
    expect(job?.status).toBe('printing');
    expect(job?.started_at).toBeTruthy();

    const command = tables.printer_commands.find((c) => c.id === COMMAND_ID);
    expect(command?.result).toMatchObject({
      startMode: 'auto',
      autoStartAttempted: true,
      autoStartSucceeded: true,
      manualStartRequired: false,
    });

    const printer = tables.printers.find((p) => p.id === PRINTER_ID);
    expect(printer?.current_job_id).toBe(JOB_ID);
  });
});
