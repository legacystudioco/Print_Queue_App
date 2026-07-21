import { notFound } from 'next/navigation';
import { AmsSlotCards } from '@/components/ams/AmsSlotCards';
import { StatusBadge } from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import {
  getAppUsersByIds,
  getJobBedClearConfirmation,
  getJobCommands,
  getJobEvents,
  getJobWithSlots,
  getPrimaryPrinter,
  getQueuePosition,
} from '@/lib/server/data';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export default async function JobDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const job = await getJobWithSlots(supabase, id);
  if (!job) notFound();

  const printer = await getPrimaryPrinter(supabase);
  const [events, commands, confirmation, queuePosition] = await Promise.all([
    getJobEvents(supabase, id),
    getJobCommands(supabase, id),
    getJobBedClearConfirmation(supabase, id),
    printer ? getQueuePosition(supabase, printer.id, id) : Promise.resolve(null),
  ]);

  const userIds = [
    job.createdBy,
    ...commands.map((c) => c.requested_by),
    confirmation?.confirmed_by,
  ].filter((v): v is string => Boolean(v));
  const users = await getAppUsersByIds(supabase, [...new Set(userIds)]);
  const nameFor = (userId: string | null) =>
    userId ? (users.find((u) => u.id === userId)?.display_name ?? users.find((u) => u.id === userId)?.email ?? 'Unknown') : '—';

  const latestFailedCommand = commands.find((c) => c.status === 'failed');

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{job.name}</h1>
          <p className="text-sm text-slate-500">{job.originalFilename}</p>
        </div>
        <StatusBadge status={job.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Print Details</CardTitle>
        </CardHeader>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-slate-500">Queue position</dt>
            <dd className="font-medium text-slate-900">{queuePosition ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">File size</dt>
            <dd className="font-medium text-slate-900">
              {(job.fileSizeBytes / 1024 / 1024).toFixed(1)} MB
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Estimated duration</dt>
            <dd className="font-medium text-slate-900">
              {job.estimatedDurationSeconds ? `${Math.round(job.estimatedDurationSeconds / 60)} min` : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Created by</dt>
            <dd className="font-medium text-slate-900">{nameFor(job.createdBy)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Started</dt>
            <dd className="font-medium text-slate-900">{formatDate(job.startedAt)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Completed</dt>
            <dd className="font-medium text-slate-900">{formatDate(job.completedAt)}</dd>
          </div>
        </dl>
        {job.notes && (
          <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{job.notes}</p>
        )}
        {job.failureMessage && (
          <p className="mt-3 rounded-lg bg-danger-50 p-3 text-sm text-danger-600">
            {job.failureMessage}
          </p>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AMS Requirements</CardTitle>
        </CardHeader>
        <AmsSlotCards slots={job.amsSlots} />
      </Card>

      {confirmation && (
        <Card>
          <CardHeader>
            <CardTitle>Bed-Clear Confirmation</CardTitle>
          </CardHeader>
          <p className="text-sm text-slate-600">
            Confirmed by {nameFor(confirmation.confirmed_by)} at {formatDate(confirmation.created_at)}
          </p>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Commands & Retry Info</CardTitle>
        </CardHeader>
        {commands.length === 0 ? (
          <p className="text-sm text-slate-500">No commands issued yet.</p>
        ) : (
          <ul className="space-y-2">
            {commands.map((c) => (
              <li key={c.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">
                  {c.command_type} · attempt {c.attempt_count} · by {nameFor(c.requested_by)}
                </span>
                <StatusBadge status={c.status} />
              </li>
            ))}
          </ul>
        )}
        {latestFailedCommand?.error_message && (
          <p className="mt-2 text-sm text-danger-600">{latestFailedCommand.error_message}</p>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status History & Printer Events</CardTitle>
        </CardHeader>
        {events.length === 0 ? (
          <p className="text-sm text-slate-500">No events recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.id} className="text-sm">
                <span className="text-slate-400">{formatDate(e.created_at)}</span>{' '}
                <span className="font-medium text-slate-700">{e.event_type}</span>
                {e.message && <span className="text-slate-600"> — {e.message}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
