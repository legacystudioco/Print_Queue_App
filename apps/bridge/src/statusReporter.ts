import type { PrinterAdapter, PrinterStatusReport, PrintCompletedNotificationData } from '@print-queue/shared';
import type { BridgeSupabaseClient } from './lib/supabase.js';
import type { Logger } from './logger.js';
import { logPrinterEvent, transitionJobStatus } from './jobStatus.js';

/** Postgres unique_violation — see the `print_job_notifications` unique(print_job_id, notification_type) constraint. */
const UNIQUE_VIOLATION = '23505';

export interface NotifyConfig {
  appUrl: string | undefined;
  webhookSecret: string | undefined;
}

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
    private readonly notify: NotifyConfig = { appUrl: undefined, webhookSecret: undefined },
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

  /** One status-check-and-reconcile cycle. Public (not just used by the interval in start()) so tests can drive it deterministically instead of through real timers. */
  async tick(): Promise<void> {
    if (this.running) return; // don't overlap ticks if one is slow
    this.running = true;

    try {
      const { data: printer, error: printerError } = await this.supabase
        .from('printers')
        .select('id, name, status, current_job_id')
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
        await this.reconcileJob(printer.current_job_id, printer.name, status);
      }
    } catch (err) {
      this.logger.error('Status report tick failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.running = false;
    }
  }

  /**
   * The only place a job is ever moved out of `printing`. Gated on the
   * job's *currently recorded* status being `printing` (not merely on the
   * printer's live status) — that's what makes this "a real transition,
   * not a single idle report": on bridge startup, on reconnect, or on any
   * tick where the printer is already idle for a job we already know is
   * done, `job.status` here is never `printing`, so this returns
   * immediately and nothing fires. It only proceeds when the job we last
   * knew to be actively printing (or, transitively, preparing/paused —
   * this bridge never leaves the pipeline in `preparing`/`paused` as a
   * *job* status, only `printing`) is now reported idle/completed by the
   * printer itself.
   */
  private async reconcileJob(jobId: string, printerName: string, status: PrinterStatusReport): Promise<void> {
    const { data: job, error } = await this.supabase
      .from('print_jobs')
      .select('id, name, status')
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
      await this.recordCompletionNotification(jobId, job.name, printerName);
    } else if (status.status === 'failed') {
      const message = 'Printer reported a failure while printing';
      await transitionJobStatus(this.supabase, this.logger, jobId, 'printing', 'failed', {
        failureMessage: message,
      });
      await this.supabase.from('printers').update({ current_job_id: null }).eq('id', this.printerId);
      await logPrinterEvent(this.supabase, this.printerId, 'job_failed', message, { printJobId: jobId });
      this.logger.warn('Detected print failure', { jobId });
      // Deliberately no notification here yet — print_failed is wired up
      // in the schema/preferences (see migration 0008) but not triggered,
      // per the "only completion is fully implemented now" scope. Mirror
      // recordCompletionNotification's shape when it's added.
    }
  }

  /**
   * Records the idempotent "this completion is notification-worthy" row
   * and, if (and only if) this bridge is the one that actually created it
   * — not a duplicate of a row already inserted by an earlier attempt —
   * asks the trusted backend to send push notifications for it. The
   * unique(print_job_id, notification_type) constraint on
   * print_job_notifications is what makes this safe to call from a status
   * loop that could in principle observe the same transition twice.
   */
  private async recordCompletionNotification(
    jobId: string,
    jobName: string,
    printerName: string,
  ): Promise<void> {
    try {
      const nextJob = await this.getNextEligibleJob();

      const body = nextJob
        ? `"${jobName}" has finished. Remove it from the printer and load the next job: "${nextJob.name}".`
        : `"${jobName}" has finished. The queue is now empty.`;

      const data: PrintCompletedNotificationData = {
        type: 'print_completed',
        printerId: this.printerId,
        printerName,
        completedJobId: jobId,
        completedJobName: jobName,
        nextJobId: nextJob?.id ?? null,
        nextJobName: nextJob?.name ?? null,
        url: `/start-next?completedJobId=${jobId}`,
      };

      const { data: inserted, error } = await this.supabase
        .from('print_job_notifications')
        .insert({
          print_job_id: jobId,
          printer_id: this.printerId,
          notification_type: 'print_completed',
          title: 'Print complete',
          body,
          // print_job_notifications.data is an untyped JSONB column by
          // design — PrintCompletedNotificationData is the convention
          // written into it (and read back via @print-queue/shared).
          data: data as unknown as Record<string, unknown>,
        })
        .select('id')
        .single();

      if (error) {
        if (error.code === UNIQUE_VIOLATION) {
          this.logger.info('Completion notification already recorded, skipping dispatch', { jobId });
          return;
        }
        this.logger.error('Failed to record completion notification', { jobId, error: error.message });
        return;
      }

      this.logger.info('Recorded completion notification', { jobId, notificationId: inserted.id });
      await this.dispatchNotification(inserted.id);
    } catch (err) {
      // Never let notification bookkeeping take down the status loop —
      // the job transition above has already been committed regardless.
      this.logger.error('recordCompletionNotification failed', {
        jobId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Next queued/ready job for this printer, lowest queue_position first — mirrors apps/web's getNextEligibleJob. */
  private async getNextEligibleJob(): Promise<{ id: string; name: string } | null> {
    const { data, error } = await this.supabase
      .from('print_jobs')
      .select('id, name')
      .eq('printer_id', this.printerId)
      .in('status', ['queued', 'ready'])
      .order('queue_position', { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      this.logger.warn('Failed to look up next eligible job for notification', { error: error.message });
      return null;
    }
    return data;
  }

  /** Pokes the trusted backend to actually send push notifications. Never holds VAPID credentials itself. */
  private async dispatchNotification(notificationId: string): Promise<void> {
    if (!this.notify.appUrl || !this.notify.webhookSecret) {
      this.logger.info('APP_URL/NOTIFY_WEBHOOK_SECRET not configured — skipping push dispatch', {
        notificationId,
      });
      return;
    }

    try {
      const response = await fetch(new URL('/api/notifications/dispatch', this.notify.appUrl), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-notify-webhook-secret': this.notify.webhookSecret,
        },
        body: JSON.stringify({ notificationId }),
      });

      if (!response.ok) {
        this.logger.warn('Dispatch webhook returned a non-OK response', {
          notificationId,
          status: response.status,
        });
        return;
      }

      this.logger.info('Dispatched push notification request', { notificationId });
    } catch (err) {
      // Not fatal: the print_job_notifications row is already durably
      // recorded with dispatched_at still null, so nothing is lost — it
      // just won't be pushed until something re-processes pending rows.
      this.logger.warn('Failed to reach dispatch webhook', {
        notificationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
