import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/States';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  getActiveQueue,
  getCurrentJob,
  getNextEligibleJob,
  getPrimaryPrinter,
  getRecentPrinterEvents,
} from '@/lib/server/data';
import { isBridgeOnline } from '@/lib/server/printer-status';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const printer = await getPrimaryPrinter(supabase);

  if (!printer) {
    return (
      <EmptyState
        title="No printer configured yet"
        description="Ask an admin to add a printer row in Supabase to get started."
      />
    );
  }

  const [currentJob, nextJob, queue, events] = await Promise.all([
    getCurrentJob(supabase, printer.id),
    getNextEligibleJob(supabase, printer.id),
    getActiveQueue(supabase, printer.id),
    getRecentPrinterEvents(supabase, printer.id, 5),
  ]);

  const bridgeOnline = isBridgeOnline(printer.lastSeenAt);
  const latestProgressEvent = events.find(
    (e) => e.event_type === 'status_report' && currentJob && e.print_job_id === currentJob.id,
  );
  const progressPercent =
    latestProgressEvent && typeof latestProgressEvent.payload === 'object'
      ? (latestProgressEvent.payload as { progressPercent?: number } | null)?.progressPercent
      : undefined;

  const queuedCount = queue.filter((j) => j.status === 'queued' || j.status === 'ready').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{printer.name}</h1>
          <p className="text-sm text-slate-500">{printer.model}</p>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <StatusBadge status={printer.status} />
          <span
            className={
              bridgeOnline ? 'text-xs font-medium text-success-600' : 'text-xs font-medium text-danger-600'
            }
          >
            Bridge {bridgeOnline ? 'online' : 'offline'}
          </span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current Print</CardTitle>
          {currentJob && <StatusBadge status={currentJob.status} />}
        </CardHeader>
        {currentJob ? (
          <div>
            <p className="text-lg font-semibold text-slate-900">{currentJob.name}</p>
            {typeof progressPercent === 'number' && (
              <div className="mt-3">
                <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand-600 transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">{progressPercent}% complete</p>
              </div>
            )}
            <Link
              href={`/jobs/${currentJob.id}`}
              className="mt-3 inline-block text-sm font-medium text-brand-600"
            >
              View details →
            </Link>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Nothing printing right now.</p>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Next Print</CardTitle>
        </CardHeader>
        {nextJob ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-slate-900">{nextJob.name}</p>
              <p className="text-sm text-slate-500">{nextJob.originalFilename}</p>
            </div>
            {!currentJob && (
              <Link
                href="/start-next"
                className="touch-target inline-flex shrink-0 items-center justify-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Start Next
              </Link>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Queue is empty.</p>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <p className="text-2xl font-bold text-slate-900">{queuedCount}</p>
          <p className="text-sm text-slate-500">Jobs queued</p>
        </Card>
        <Card>
          <p className="text-2xl font-bold text-slate-900">
            {printer.lastSeenAt ? new Date(printer.lastSeenAt).toLocaleTimeString() : '—'}
          </p>
          <p className="text-sm text-slate-500">Last bridge heartbeat</p>
        </Card>
      </div>

      <Link href="/queue" className="block text-center text-sm font-medium text-brand-600">
        View full queue →
      </Link>
    </div>
  );
}
