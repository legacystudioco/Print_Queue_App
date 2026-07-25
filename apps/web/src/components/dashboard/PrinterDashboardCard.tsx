import type { PrintJobRecord, PrintJobWithSlots, PrinterRecord } from '@print-queue/shared';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Card, CardEyebrow, CardHeader, CardTitle } from '@/components/ui/Card';
import { StatusBadge, jobDisplayStatus } from '@/components/ui/Badge';
import { LocalTime } from '@/components/ui/LocalTime';
import { JobFileList } from '@/components/job/JobFileList';
import { TIME_WITH_SECONDS } from '@/lib/client/dateTime';
import { isBridgeOnline } from '@/lib/server/printer-status';
import type { JobDisplayFlags } from '@/lib/server/data';

export function PrinterDashboardCard({
  printer,
  currentJob,
  nextJob,
  queuedCount,
  progressPercent,
}: {
  printer: PrinterRecord;
  currentJob: (PrintJobRecord & JobDisplayFlags) | null;
  nextJob: PrintJobWithSlots | null;
  queuedCount: number;
  progressPercent: number | undefined;
}) {
  const bridgeOnline = isBridgeOnline(printer.lastSeenAt);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <CardEyebrow>Printer</CardEyebrow>
          <h2 className="text-2xl font-extrabold tracking-tight text-charcoal-900">{printer.name}</h2>
          <p className="text-sm text-charcoal-500">{printer.model}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 text-right">
          <StatusBadge status={printer.status} />
          <span
            className={
              bridgeOnline
                ? 'inline-flex items-center gap-1.5 text-xs font-bold text-success-600'
                : 'inline-flex items-center gap-1.5 text-xs font-bold text-danger-600'
            }
          >
            <span
              className={
                bridgeOnline ? 'h-1.5 w-1.5 rounded-full bg-success-500' : 'h-1.5 w-1.5 rounded-full bg-danger-500'
              }
              aria-hidden="true"
            />
            Bridge {bridgeOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current Print</CardTitle>
          {currentJob && <StatusBadge status={jobDisplayStatus(currentJob.status, currentJob)} />}
        </CardHeader>
        {currentJob ? (
          <div>
            <p className="text-xl font-bold tracking-tight text-charcoal-900">{currentJob.name}</p>
            {currentJob.manualStartRequired ? (
              <p className="mt-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-800">
                File uploaded successfully, but the printer did not start automatically. Start it
                manually from the printer or its companion app.
              </p>
            ) : (
              typeof progressPercent === 'number' && (
                <div className="mt-4">
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-charcoal-100">
                    <div
                      className="h-full rounded-full bg-accent-500 transition-all"
                      style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs font-bold tabular-nums text-charcoal-500">
                    {progressPercent}% complete
                  </p>
                </div>
              )
            )}
            <Link
              href={`/jobs/${currentJob.id}`}
              className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-accent-600 hover:text-accent-700"
            >
              View details
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <p className="text-sm text-charcoal-500">Nothing printing right now.</p>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Next Print</CardTitle>
        </CardHeader>
        {nextJob ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-lg font-bold tracking-tight text-charcoal-900">{nextJob.name}</p>
              <JobFileList files={nextJob.files} className="mt-1" />
            </div>
            {!currentJob && (
              <Link
                href={`/start-next?printerId=${printer.id}`}
                className="touch-target inline-flex shrink-0 items-center justify-center rounded-lg bg-accent-500 px-4 text-sm font-bold tracking-wide text-white shadow-panel transition-all hover:-translate-y-px hover:bg-accent-600 hover:shadow-panel-lift"
              >
                Start Next
              </Link>
            )}
          </div>
        ) : (
          <p className="text-sm text-charcoal-500">Queue is empty.</p>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardEyebrow>Jobs Queued</CardEyebrow>
          <p className="mt-1 text-3xl font-extrabold tabular-nums text-charcoal-900">{queuedCount}</p>
        </Card>
        <Card>
          <CardEyebrow>Last Heartbeat</CardEyebrow>
          <p className="mt-1 text-3xl font-extrabold tabular-nums text-charcoal-900">
            <LocalTime iso={printer.lastSeenAt} options={TIME_WITH_SECONDS} />
          </p>
        </Card>
      </div>
    </div>
  );
}
