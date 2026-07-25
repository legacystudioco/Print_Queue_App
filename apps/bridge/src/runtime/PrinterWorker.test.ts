import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrinterAdapter, PrinterCapabilities, PrinterConnectionResult, PrinterStatusReport } from '@print-queue/shared';
import { loadConfig } from '../config.js';
import { createLogger } from '../logger.js';
import { createFakeSupabase } from '../testSupport/fakeSupabase.js';
import { PrinterWorker, type AdapterFactory } from './PrinterWorker.js';

const FULL_CAPS: PrinterCapabilities = {
  canUploadFile: true,
  canStartPrint: true,
  canPause: true,
  canResume: true,
  canCancel: true,
  canReportProgress: true,
  canReportTemperatures: true,
  supportsDeliveryOnly: true,
};

function fakeAdapter(connected: boolean): PrinterAdapter {
  return {
    async testConnection(): Promise<PrinterConnectionResult> {
      return connected ? { connected: true } : { connected: false, message: 'simulated unreachable' };
    },
    async getStatus(): Promise<PrinterStatusReport> {
      return { status: connected ? 'idle' : 'offline' };
    },
    async uploadPrintFile() {
      return { remoteFileName: 'x' };
    },
    async startPrint() {
      return { started: true };
    },
    async pausePrint() {},
    async resumePrint() {},
    async cancelPrint() {},
    getCapabilities() {
      return FULL_CAPS;
    },
  };
}

const config = loadConfig({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'secret-key',
  BRIDGE_ID: 'home-old-mac',
});
const logger = createLogger('error');

describe('PrinterWorker', () => {
  let worker: PrinterWorker | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await worker?.stop();
    worker = null;
  });

  it('is not running after a failed health check, and retries with backoff until it succeeds', async () => {
    const { client } = createFakeSupabase({
      printers: [{ id: 'ff-1', name: 'SquishPrint', brand: 'flashforge', bridge_id: 'home-old-mac', enabled: true }],
    });

    let attempts = 0;
    const adapterFactory: AdapterFactory = () => {
      attempts += 1;
      return fakeAdapter(attempts >= 3); // fails twice, succeeds on the 3rd attempt
    };

    worker = new PrinterWorker(config, client, logger, { id: 'ff-1', name: 'SquishPrint', brand: 'flashforge' }, adapterFactory);

    await worker.start();
    expect(worker.isRunning).toBe(false);
    expect(attempts).toBe(1);

    // First retry after BASE_RETRY_DELAY_MS (5s)
    await vi.advanceTimersByTimeAsync(5_000);
    expect(worker.isRunning).toBe(false);
    expect(attempts).toBe(2);

    // Second retry backs off further (10s)
    await vi.advanceTimersByTimeAsync(10_000);
    expect(worker.isRunning).toBe(true);
    expect(attempts).toBe(3);
  });

  it('stop() clears a pending retry timer instead of letting it fire', async () => {
    const { client } = createFakeSupabase({
      printers: [{ id: 'ff-1', name: 'SquishPrint', brand: 'flashforge', bridge_id: 'home-old-mac', enabled: true }],
    });

    let attempts = 0;
    const adapterFactory: AdapterFactory = () => {
      attempts += 1;
      return fakeAdapter(false);
    };

    worker = new PrinterWorker(config, client, logger, { id: 'ff-1', name: 'SquishPrint', brand: 'flashforge' }, adapterFactory);
    await worker.start();
    expect(attempts).toBe(1);

    await worker.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(attempts).toBe(1); // no further attempts after stop()
  });
});
