import type { BridgeConfig } from '../config.js';
import type { Logger } from '../logger.js';
import type { BridgeSupabaseClient } from '../lib/supabase.js';
import { PrinterWorker, type AdapterFactory } from './PrinterWorker.js';
import { loadAssignedPrinters } from './loadAssignedPrinters.js';

/**
 * Registers this bridge host and starts one isolated PrinterWorker per
 * enabled physical printer row assigned to it (`printers.bridge_id`,
 * already the repository's existing bridge/device assignment mechanism —
 * see 0001_extensions_enums_tables.sql). Replaces the old single-printer
 * assumption in index.ts: the old Mac can now run the Bambu worker and the
 * Flashforge worker concurrently in one process, and a failure in one
 * never stops the other (each worker manages its own startup retry loop —
 * see PrinterWorker).
 */
export class BridgeSupervisor {
  private workers: PrinterWorker[] = [];

  constructor(
    private readonly config: BridgeConfig,
    private readonly supabase: BridgeSupabaseClient,
    private readonly logger: Logger,
    private readonly adapterFactory?: AdapterFactory,
  ) {}

  async start(): Promise<void> {
    const printers = await loadAssignedPrinters(this.supabase, this.config.BRIDGE_ID);

    this.logger.info('Starting printer workers', {
      bridgeId: this.config.BRIDGE_ID,
      printerCount: printers.length,
    });

    this.workers = printers.map(
      (printer) => new PrinterWorker(this.config, this.supabase, this.logger, printer, this.adapterFactory),
    );

    // Each worker manages its own startup retry loop internally (see
    // PrinterWorker.attemptStart), so awaiting all of them here completes
    // as soon as every worker's first attempt has been scheduled — one
    // unreachable printer never blocks or fails the others starting.
    await Promise.allSettled(this.workers.map((worker) => worker.start()));
  }

  async stop(): Promise<void> {
    await Promise.allSettled(this.workers.map((worker) => worker.stop()));
  }

  /** Test/diagnostics introspection only. */
  get workerHandles(): readonly PrinterWorker[] {
    return this.workers;
  }
}
