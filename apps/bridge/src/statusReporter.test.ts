import type { PrinterAdapter, PrinterStatusReport } from '@print-queue/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusReporter } from './statusReporter.js';
import { createLogger } from './logger.js';
import { createFakeSupabase } from './testSupport/fakeSupabase.js';

const PRINTER_ID = 'printer-1';
const JOB_ID = 'job-1';
const NEXT_JOB_ID = 'job-2';
const APP_URL = 'https://queue.example.com';
const WEBHOOK_SECRET = 'shh-its-a-secret';

const logger = createLogger('error');

function fakeAdapter(status: PrinterStatusReport): PrinterAdapter {
  return {
    testConnection: async () => ({ connected: true }),
    getStatus: async () => status,
    uploadPrintFile: async (input) => ({ remoteFileName: input.remoteFileName }),
    startPrint: async () => ({ started: true }),
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
  };
}

function seedPrinter(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: PRINTER_ID, name: 'Workshop P1S', status: 'unknown', current_job_id: null, ...overrides };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('StatusReporter — print completion notifications', () => {
  it('printing -> completed sends exactly one notification, dispatched to the webhook', async () => {
    const { client, tables } = createFakeSupabase({
      printers: [seedPrinter({ current_job_id: JOB_ID })],
      print_jobs: [{ id: JOB_ID, name: 'Monsters', status: 'printing', printer_id: PRINTER_ID }],
    });

    const reporter = new StatusReporter(client, fakeAdapter({ status: 'completed' }), logger, PRINTER_ID, 1000, {
      appUrl: APP_URL,
      webhookSecret: WEBHOOK_SECRET,
    });

    await reporter.tick();

    expect(tables.print_jobs.find((j) => j.id === JOB_ID)?.status).toBe('completed');
    expect(tables.print_job_notifications).toHaveLength(1);

    const notification = tables.print_job_notifications[0]!;
    expect(notification).toMatchObject({
      print_job_id: JOB_ID,
      printer_id: PRINTER_ID,
      notification_type: 'print_completed',
      title: 'Print complete',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(`${APP_URL}/api/notifications/dispatch`);
    expect((init.headers as Record<string, string>)['x-notify-webhook-secret']).toBe(WEBHOOK_SECRET);
    expect(JSON.parse(init.body as string)).toEqual({ notificationId: notification.id });
  });

  it('uses the queue-empty message when there is no next job', async () => {
    const { client, tables } = createFakeSupabase({
      printers: [seedPrinter({ current_job_id: JOB_ID })],
      print_jobs: [{ id: JOB_ID, name: 'Monsters', status: 'printing', printer_id: PRINTER_ID }],
    });
    const reporter = new StatusReporter(client, fakeAdapter({ status: 'completed' }), logger, PRINTER_ID, 1000, {
      appUrl: APP_URL,
      webhookSecret: WEBHOOK_SECRET,
    });

    await reporter.tick();

    const notification = tables.print_job_notifications[0]!;
    expect(notification.body).toBe('"Monsters" has finished. The queue is now empty.');
    expect((notification.data as Record<string, unknown>).nextJobId).toBeNull();
  });

  it('names the next queued job when one exists', async () => {
    const { client, tables } = createFakeSupabase({
      printers: [seedPrinter({ current_job_id: JOB_ID })],
      print_jobs: [
        { id: JOB_ID, name: 'Monsters', status: 'printing', printer_id: PRINTER_ID },
        { id: NEXT_JOB_ID, name: 'Stripes & Helmets', status: 'queued', printer_id: PRINTER_ID, queue_position: 1 },
      ],
    });
    const reporter = new StatusReporter(client, fakeAdapter({ status: 'completed' }), logger, PRINTER_ID, 1000, {
      appUrl: APP_URL,
      webhookSecret: WEBHOOK_SECRET,
    });

    await reporter.tick();

    const notification = tables.print_job_notifications[0]!;
    expect(notification.body).toBe(
      '"Monsters" has finished. Remove it from the printer and load the next job: "Stripes & Helmets".',
    );
    expect((notification.data as Record<string, unknown>).nextJobId).toBe(NEXT_JOB_ID);
    expect((notification.data as Record<string, unknown>).nextJobName).toBe('Stripes & Helmets');
  });

  it('does not send a duplicate notification for repeated "completed" reports of the same job', async () => {
    const { client, tables } = createFakeSupabase({
      printers: [seedPrinter({ current_job_id: JOB_ID })],
      print_jobs: [{ id: JOB_ID, name: 'Monsters', status: 'printing', printer_id: PRINTER_ID }],
    });
    const reporter = new StatusReporter(client, fakeAdapter({ status: 'completed' }), logger, PRINTER_ID, 1000, {
      appUrl: APP_URL,
      webhookSecret: WEBHOOK_SECRET,
    });

    // A real printer keeps reporting "completed" on every subsequent poll —
    // the job.status !== 'printing' guard is what stops the second tick
    // from re-entering reconcileJob at all.
    await reporter.tick();
    await reporter.tick();
    await reporter.tick();

    expect(tables.print_job_notifications).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not dispatch again if a notification row already exists for this job (unique-constraint defense-in-depth)', async () => {
    // Simulates the case the job.status guard alone can't cover: a
    // completion was already recorded (e.g. a previous, interrupted
    // attempt), but reconcileJob is invoked again for a job still marked
    // printing. The print_job_notifications unique(print_job_id,
    // notification_type) constraint — not application logic — is what
    // stops this from becoming a second push.
    const { client, tables } = createFakeSupabase({
      printers: [seedPrinter({ current_job_id: JOB_ID })],
      print_jobs: [{ id: JOB_ID, name: 'Monsters', status: 'printing', printer_id: PRINTER_ID }],
      print_job_notifications: [
        {
          id: 'existing-notification',
          print_job_id: JOB_ID,
          printer_id: PRINTER_ID,
          notification_type: 'print_completed',
          title: 'Print complete',
          body: 'already sent',
          data: {},
          dispatched_at: new Date().toISOString(),
        },
      ],
    });
    const reporter = new StatusReporter(client, fakeAdapter({ status: 'completed' }), logger, PRINTER_ID, 1000, {
      appUrl: APP_URL,
      webhookSecret: WEBHOOK_SECRET,
    });

    await reporter.tick();

    expect(tables.print_job_notifications).toHaveLength(1);
    expect(tables.print_job_notifications[0]!.id).toBe('existing-notification');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends nothing on bridge startup when the printer has no current job', async () => {
    const { client, tables } = createFakeSupabase({
      printers: [seedPrinter({ current_job_id: null })],
      print_jobs: [],
    });
    const reporter = new StatusReporter(client, fakeAdapter({ status: 'idle' }), logger, PRINTER_ID, 1000, {
      appUrl: APP_URL,
      webhookSecret: WEBHOOK_SECRET,
    });

    await reporter.tick();

    expect(tables.print_job_notifications).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends nothing on reconnect while idle, even with a stale current_job_id pointing at an already-finished job', async () => {
    const { client, tables } = createFakeSupabase({
      printers: [seedPrinter({ current_job_id: JOB_ID })],
      print_jobs: [{ id: JOB_ID, name: 'Monsters', status: 'completed', printer_id: PRINTER_ID }],
    });
    const reporter = new StatusReporter(client, fakeAdapter({ status: 'idle' }), logger, PRINTER_ID, 1000, {
      appUrl: APP_URL,
      webhookSecret: WEBHOOK_SECRET,
    });

    await reporter.tick();

    expect(tables.print_job_notifications).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not send a print_completed notification when the printer reports a failure', async () => {
    const { client, tables } = createFakeSupabase({
      printers: [seedPrinter({ current_job_id: JOB_ID })],
      print_jobs: [{ id: JOB_ID, name: 'Monsters', status: 'printing', printer_id: PRINTER_ID }],
    });
    const reporter = new StatusReporter(client, fakeAdapter({ status: 'failed' }), logger, PRINTER_ID, 1000, {
      appUrl: APP_URL,
      webhookSecret: WEBHOOK_SECRET,
    });

    await reporter.tick();

    expect(tables.print_jobs.find((j) => j.id === JOB_ID)?.status).toBe('failed');
    expect(tables.print_job_notifications).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still records the notification row but skips the webhook call when APP_URL/NOTIFY_WEBHOOK_SECRET are not configured', async () => {
    const { client, tables } = createFakeSupabase({
      printers: [seedPrinter({ current_job_id: JOB_ID })],
      print_jobs: [{ id: JOB_ID, name: 'Monsters', status: 'printing', printer_id: PRINTER_ID }],
    });
    const reporter = new StatusReporter(client, fakeAdapter({ status: 'completed' }), logger, PRINTER_ID, 1000, {
      appUrl: undefined,
      webhookSecret: undefined,
    });

    await reporter.tick();

    expect(tables.print_job_notifications).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
