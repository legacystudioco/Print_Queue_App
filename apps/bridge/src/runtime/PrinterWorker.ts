import type { PrinterAdapter, PrintStartMode } from '@print-queue/shared';
import type { BridgeConfig } from '../config.js';
import type { Logger } from '../logger.js';
import type { BridgeSupabaseClient } from '../lib/supabase.js';
import type { PrintersRow } from '../lib/database.types.js';
import { createPrinterAdapter } from '../printers/factory.js';
import { runStartupHealthCheck } from '../healthCheck.js';
import { recoverStaleCommands } from '../recovery.js';
import { StatusReporter } from '../statusReporter.js';
import { CommandLoop } from '../commandLoop.js';

const BASE_RETRY_DELAY_MS = 5_000;
const MAX_RETRY_DELAY_MS = 60_000;

export type WorkerPrinter = Pick<PrintersRow, 'id' | 'name' | 'brand'>;

/** Same shape as printers/factory.ts's createPrinterAdapter — overridable in tests so failure-isolation can be exercised without real printer hardware. */
export type AdapterFactory = typeof createPrinterAdapter;

/**
 * Owns exactly one physical printer's full lifecycle: adapter instance,
 * startup health check, stale-command recovery, StatusReporter, and
 * CommandLoop — everything apps/bridge/src/index.ts used to do inline for
 * the single configured printer. A printer that fails to connect at
 * startup retries with bounded exponential backoff instead of exiting the
 * process, so one bad printer never affects any other worker running in
 * the same bridge process (see BridgeSupervisor).
 *
 * Once started, CommandLoop and StatusReporter already catch and log their
 * own per-tick errors internally (see commandLoop.ts/statusReporter.ts) —
 * a transient disconnect surfaces as an "offline" status report or a failed
 * command, not a crash — so this worker's own retry loop only needs to
 * cover the startup phase (adapter construction + health check).
 */
export class PrinterWorker {
  readonly printerId: string;
  readonly printerName: string;
  readonly printerBrand: string;

  private readonly logger: Logger;
  private adapter: PrinterAdapter | null = null;
  private statusReporter: StatusReporter | null = null;
  private commandLoop: CommandLoop | null = null;
  private stopped = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;

  constructor(
    private readonly config: BridgeConfig,
    private readonly supabase: BridgeSupabaseClient,
    baseLogger: Logger,
    private readonly printer: WorkerPrinter,
    private readonly adapterFactory: AdapterFactory = createPrinterAdapter,
  ) {
    this.printerId = printer.id;
    this.printerName = printer.name;
    this.printerBrand = printer.brand;
    this.logger = baseLogger.child({
      printerId: printer.id,
      printerBrand: printer.brand,
      printerName: printer.name,
    });
  }

  async start(): Promise<void> {
    await this.attemptStart();
  }

  /** True while the health check has passed and the status/command loops are actively running (false before start, after a failed health check, or after stop()). Test/diagnostics introspection only. */
  get isRunning(): boolean {
    return !this.stopped && this.commandLoop !== null && this.statusReporter !== null;
  }

  private async attemptStart(): Promise<void> {
    if (this.stopped) return;
    this.attempt += 1;

    try {
      const adapter = this.adapterFactory(this.config, this.logger, this.printer);
      const health = await runStartupHealthCheck(adapter, this.logger);

      if (!health.healthy) {
        this.logger.error('Startup health check failed, will retry with backoff', {
          label: health.label,
          attempt: this.attempt,
        });
        this.scheduleRetry();
        return;
      }

      this.adapter = adapter;
      await recoverStaleCommands(this.supabase, this.logger, this.config.BRIDGE_ID);

      this.statusReporter = new StatusReporter(
        this.supabase,
        adapter,
        this.logger,
        this.printerId,
        this.config.HEARTBEAT_INTERVAL_MS,
        { appUrl: this.config.APP_URL, webhookSecret: this.config.NOTIFY_WEBHOOK_SECRET },
      );
      this.commandLoop = new CommandLoop(
        this.supabase,
        adapter,
        this.logger,
        this.printerId,
        this.config.BRIDGE_ID,
        this.config.TEMP_DIRECTORY,
        this.config.COMMAND_POLL_INTERVAL_MS,
        this.printStartModeFor(this.printer.brand),
        this.printer.brand,
      );

      this.statusReporter.start();
      this.commandLoop.start();
      this.attempt = 0;
      this.logger.info('Printer worker started');
    } catch (err) {
      this.logger.error('Printer worker failed to start, will retry with backoff', {
        error: err instanceof Error ? err.message : String(err),
        attempt: this.attempt,
      });
      this.scheduleRetry();
    }
  }

  /** Bambu and Flashforge each have their own print-start-mode env var (see config.ts); other brands don't start prints at all. */
  private printStartModeFor(brand: string): PrintStartMode {
    if (brand === 'flashforge') return this.config.FLASHFORGE_PRINT_START_MODE;
    return this.config.BAMBU_PRINT_START_MODE;
  }

  private scheduleRetry(): void {
    if (this.stopped) return;
    const delay = Math.min(BASE_RETRY_DELAY_MS * 2 ** (this.attempt - 1), MAX_RETRY_DELAY_MS);
    this.retryTimer = setTimeout(() => void this.attemptStart(), delay);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);

    this.statusReporter?.stop();
    this.commandLoop?.stop();

    if (this.adapter && hasDisconnect(this.adapter)) {
      await this.adapter.disconnect();
    }
    this.logger.info('Printer worker stopped');
  }
}

function hasDisconnect(adapter: PrinterAdapter): adapter is PrinterAdapter & { disconnect: () => Promise<void> } {
  return typeof (adapter as { disconnect?: unknown }).disconnect === 'function';
}
