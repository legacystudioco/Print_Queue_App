import type { PrinterAdapter, PrinterStatusReport } from '@print-queue/shared';
import type { BridgeSupabaseClient } from './lib/supabase.js';
import type { Logger } from './logger.js';
import { logPrinterEvent, transitionJobStatus } from './jobStatus.js';

/**
 * Runs continuously in the background, independent of the command loop.
 * This is what makes the dashboard's "printer status" and "current print
 * progress" live, and — critically — what notices a print finishing or
 * failing on its own (not in response to any command) and updates the job
 * accordingly. It never starts a new print; the next queued job stays
 * `queued`/`ready` until a human completes the Start Next checklist.
 */
export class StatusReporter {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly supabase: BridgeSupabaseClient,
    private readonly adapter: PrinterAdapter,
    private readonly logger: Logger,
    private readonly printerId: string,
    private readonly intervalMs: number,
  ) {}

  start(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (this.running) return; // don't overlap ticks if one is slow
    this.running = true;

    try {
      const { data: printer, error: printerError } = await this.supabase
        .from('printers')
        .select('id, status, current_job_id')
        .eq('id', this.printerId)
        .single();
      if (printerError || !printer) {
        this.logger.error('Could not load printer row for status report', {
          error: printerError?.message,
        });
        return;
      }

      let status: PrinterStatusReport;
      try {
        status = await this.adapter.getStatus();
      } catch (err) {
        this.logger.warn('Failed to reach printer for status report', {
          error: err instanceof Error ? err.message : String(err),
        });
        status = { status: 'offline' };
      }

      await this.supabase
        .from('printers')
        .update({ status: status.status, last_seen_at: new Date().toISOString() })
        .eq('id', this.printerId);

      await logPrinterEvent(this.supabase, this.printerId, 'status_report', `Status: ${status.status}`, {
        printJobId: printer.current_job_id,
        payload: {
          progressPercent: status.progressPercent,
          currentFileName: status.currentFileName,
          nozzleTempCelsius: status.nozzleTempCelsius,
          bedTempCelsius: status.bedTempCelsius,
        },
      });

      if (printer.current_job_id) {
        await this.reconcileJob(printer.current_job_id, status);
      }
    } catch (err) {
      this.logger.error('Status report tick failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.running = false;
    }
  }

  private async reconcileJob(jobId: string, status: PrinterStatusReport): Promise<void> {
    const { data: job, error } = await this.supabase
      .from('print_jobs')
      .select('id, status')
      .eq('id', jobId)
      .single();
    if (error || !job || job.status !== 'printing') return;

    if (status.status === 'completed') {
      await transitionJobStatus(this.supabase, this.logger, jobId, 'printing', 'completed', {
        completedAt: new Date().toISOString(),
      });
      await this.supabase.from('printers').update({ current_job_id: null }).eq('id', this.printerId);
      await logPrinterEvent(this.supabase, this.printerId, 'job_completed', 'Print finished', {
        printJobId: jobId,
      });
      this.logger.info('Detected print completion', { jobId });
    } else if (status.status === 'failed') {
      const message = 'Printer reported a failure while printing';
      await transitionJobStatus(this.supabase, this.logger, jobId, 'printing', 'failed', {
        failureMessage: message,
      });
      await this.supabase.from('printers').update({ current_job_id: null }).eq('id', this.printerId);
      await logPrinterEvent(this.supabase, this.printerId, 'job_failed', message, { printJobId: jobId });
      this.logger.warn('Detected print failure', { jobId });
    }
  }
}
