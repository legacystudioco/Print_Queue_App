import { describe, expect, it, afterEach } from 'vitest';
import type { PrinterAdapter, PrinterCapabilities, PrinterConnectionResult, PrinterStatusReport } from '@print-queue/shared';
import { loadConfig } from '../config.js';
import { createLogger } from '../logger.js';
import { createFakeSupabase } from '../testSupport/fakeSupabase.js';
import { BridgeSupervisor } from './BridgeSupervisor.js';
import type { AdapterFactory } from './PrinterWorker.js';

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

describe('BridgeSupervisor', () => {
  let supervisor: BridgeSupervisor | null = null;

  afterEach(async () => {
    await supervisor?.stop();
    supervisor = null;
  });

  it('starts one worker per enabled printer assigned to this bridge host, and does not pick up a printer on another host', async () => {
    const { client } = createFakeSupabase({
      printers: [
        { id: 'bambu-1', name: 'Workshop P1S', brand: 'bambu', bridge_id: 'home-old-mac', enabled: true },
        { id: 'ff-1', name: 'SquishPrint', brand: 'flashforge', bridge_id: 'home-old-mac', enabled: true },
        { id: 'sm-1', name: 'Some Snapmaker', brand: 'snapmaker', bridge_id: 'other-bridge-host', enabled: true },
      ],
    });

    const adapterFactory: AdapterFactory = () => fakeAdapter(true);

    supervisor = new BridgeSupervisor(config, client, logger, adapterFactory);
    await supervisor.start();

    const handles = supervisor.workerHandles;
    expect(handles.map((h) => h.printerId).sort()).toEqual(['bambu-1', 'ff-1']);
    expect(handles.every((h) => h.isRunning)).toBe(true);
  });

  it('a Flashforge worker that fails its health check does not stop the Bambu worker from running', async () => {
    const { client } = createFakeSupabase({
      printers: [
        { id: 'bambu-1', name: 'Workshop P1S', brand: 'bambu', bridge_id: 'home-old-mac', enabled: true },
        { id: 'ff-1', name: 'SquishPrint', brand: 'flashforge', bridge_id: 'home-old-mac', enabled: true },
      ],
    });

    const adapterFactory: AdapterFactory = (_config, _logger, printer) => fakeAdapter(printer.brand !== 'flashforge');

    supervisor = new BridgeSupervisor(config, client, logger, adapterFactory);
    await supervisor.start();

    const bambuWorker = supervisor.workerHandles.find((h) => h.printerId === 'bambu-1');
    const flashforgeWorker = supervisor.workerHandles.find((h) => h.printerId === 'ff-1');

    expect(bambuWorker?.isRunning).toBe(true);
    expect(flashforgeWorker?.isRunning).toBe(false);
  });

  it('never runs two workers for the same printer id even if the query returns a duplicate row', async () => {
    const { client } = createFakeSupabase({
      printers: [
        { id: 'bambu-1', name: 'Workshop P1S', brand: 'bambu', bridge_id: 'home-old-mac', enabled: true },
        { id: 'bambu-1', name: 'Workshop P1S (dup)', brand: 'bambu', bridge_id: 'home-old-mac', enabled: true },
      ],
    });

    const adapterFactory: AdapterFactory = () => fakeAdapter(true);
    supervisor = new BridgeSupervisor(config, client, logger, adapterFactory);
    await supervisor.start();

    expect(supervisor.workerHandles).toHaveLength(1);
  });

  it('throws if no enabled printer is assigned to this bridge host', async () => {
    const { client } = createFakeSupabase({ printers: [] });
    supervisor = new BridgeSupervisor(config, client, logger, () => fakeAdapter(true));
    await expect(supervisor.start()).rejects.toThrow(/No enabled printer rows found/);
  });

  it('excludes a disabled printer row', async () => {
    const { client } = createFakeSupabase({
      printers: [
        { id: 'bambu-1', name: 'Workshop P1S', brand: 'bambu', bridge_id: 'home-old-mac', enabled: true },
        { id: 'ff-1', name: 'SquishPrint', brand: 'flashforge', bridge_id: 'home-old-mac', enabled: false },
      ],
    });

    supervisor = new BridgeSupervisor(config, client, logger, () => fakeAdapter(true));
    await supervisor.start();

    expect(supervisor.workerHandles.map((h) => h.printerId)).toEqual(['bambu-1']);
  });

  it('gracefully stops every worker', async () => {
    const { client } = createFakeSupabase({
      printers: [
        { id: 'bambu-1', name: 'Workshop P1S', brand: 'bambu', bridge_id: 'home-old-mac', enabled: true },
        { id: 'ff-1', name: 'SquishPrint', brand: 'flashforge', bridge_id: 'home-old-mac', enabled: true },
      ],
    });

    supervisor = new BridgeSupervisor(config, client, logger, () => fakeAdapter(true));
    await supervisor.start();
    expect(supervisor.workerHandles.every((h) => h.isRunning)).toBe(true);

    await supervisor.stop();
    expect(supervisor.workerHandles.every((h) => h.isRunning)).toBe(false);
  });

  it(
    'end-to-end with the REAL adapter factory: missing Flashforge env vars produce a scoped worker error and do not stop the Bambu worker from being constructed and attempted',
    async () => {
      const { client } = createFakeSupabase({
        printers: [
          { id: 'bambu-1', name: 'Workshop P1S', brand: 'bambu', bridge_id: 'home-real-factory', enabled: true },
          { id: 'ff-1', name: 'SquishPrint', brand: 'flashforge', bridge_id: 'home-real-factory', enabled: true },
        ],
      });

      // Deliberately no FLASHFORGE_* vars at all, proving loadConfig() itself
      // never requires them (they're all .optional()) and that the
      // per-worker factory call — not a global up-front check — is what
      // rejects the Flashforge printer. Bambu vars point at a real, local,
      // definitely-closed TCP port so its (real) MQTT connect attempt fails
      // fast with ECONNREFUSED rather than hanging for its full 10s
      // connectTimeout.
      const realFactoryConfig = loadConfig({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SECRET_KEY: 'secret-key',
        BRIDGE_ID: 'home-real-factory',
        PRINTER_ADAPTER: 'bambu',
        BAMBU_PRINTER_IP: '127.0.0.1',
        BAMBU_PRINTER_SERIAL: '00M00A000000000',
        BAMBU_ACCESS_CODE: '12345678',
      });

      // No adapterFactory override passed — this exercises the real
      // printers/factory.ts createPrinterAdapter, not a test double.
      supervisor = new BridgeSupervisor(realFactoryConfig, client, logger);
      await supervisor.start();

      expect(supervisor.workerHandles).toHaveLength(2);
      // Neither worker can actually succeed in this environment (no real
      // printers exist), but both must have been independently constructed
      // and attempted — the missing Flashforge config must not have
      // prevented the Bambu worker from ever being created.
      expect(supervisor.workerHandles.every((h) => !h.isRunning)).toBe(true);
    },
    15_000,
  );
});
