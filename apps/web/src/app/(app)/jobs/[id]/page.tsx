import { formatPrintTime } from '@print-queue/shared';
import { notFound } from 'next/navigation';
import { AmsSlotCards } from '@/components/ams/AmsSlotCards';
import { AddJobFileForm } from '@/components/job/AddJobFileForm';
import { JobFileList } from '@/components/job/JobFileList';
import { MoveToPrinterDialog } from '@/components/queue/MoveToPrinterDialog';
import { StatusBadge, jobDisplayStatus } from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { LocalTime } from '@/components/ui/LocalTime';
import { getCurrentAppUser } from '@/lib/server/auth';
import {
  getAllPrinters,
  getAppUsersByIds,
  getJobBedClearConfirmation,
  getJobCommands,
  getJobEvents,
  getJobWithSlots,
  getPrinterById,
  getQueuePosition,
} from '@/lib/server/data';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function JobDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const [user, job] = await Promise.all([getCurrentAppUser(), getJobWithSlots(supabase, id)]);
  if (!job) notFound();

  const printer = await getPrinterById(supabase, job.printerId);
  const [events, commands, confirmation, queuePosition, allPrinters] = await Promise.all([
    getJobEvents(supabase, id),
    getJobCommands(supabase, id),
    getJobBedClearConfirmation(supabase, id),
    printer ? getQueuePosition(supabase, printer.id, id) : Promise.resolve(null),
    getAllPrinters(supabase),
  ]);

  const hasBambuFile = job.files.some((f) => f.printerBrand === 'bambu');
  const isAdmin = user?.role === 'admin';
  const canReassign = isAdmin && (job.status === 'queued' || job.status === 'ready');

  const userIds = [
    job.createdBy,
    ...commands.map((c) => c.requested_by),
    confirmation?.confirmed_by,
  ].filter((v): v is string => Boolean(v));
  const users = await getAppUsersByIds(supabase, [...new Set(userIds)]);
  const nameFor = (userId: string | null) =>
    userId ? (users.find((u) => u.id === userId)?.display_name ?? users.find((u) => u.id === userId)?.email ?? 'Unknown') : '—';

  const latestFailedCommand = commands.find((c) => c.status === 'failed');
  const latestStartPrintCommand = commands.find((c) => c.command_type === 'start_print');
  const manualStartMessage =
    job.manualStartRequired && latestStartPrintCommand?.result && typeof latestStartPrintCommand.result === 'object'
      ? (latestStartPrintCommand.result as { message?: string }).message
      : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-charcoal-900">{job.name}</h1>
          <p className="text-sm text-charcoal-400">
            {printer ? `Assigned to ${printer.name}` : 'No printer assigned'}
          </p>
        </div>
        <StatusBadge status={jobDisplayStatus(job.status, job)} />
      </div>

      <Card className="space-y-3">
        <CardHeader>
          <CardTitle>Printer Files</CardTitle>
        </CardHeader>
        <JobFileList files={job.files} />
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2 border-t border-charcoal-100 pt-3">
            {canReassign && (
              <MoveToPrinterDialog
                jobId={job.id}
                currentPrinterId={job.printerId}
                files={job.files}
                printers={allPrinters}
              />
            )}
            <AddJobFileForm jobId={job.id} existingFiles={job.files} />
          </div>
        )}
      </Card>

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
            <dt className="text-slate-500">Estimated duration</dt>
            <dd className="font-medium text-slate-900">
              {job.estimatedDurationSeconds ? formatPrintTime(Math.round(job.estimatedDurationSeconds / 60)) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Created by</dt>
            <dd className="font-medium text-slate-900">{nameFor(job.createdBy)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Started</dt>
            <dd className="font-medium text-slate-900">
              <LocalTime iso={job.startedAt} />
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Completed</dt>
            <dd className="font-medium text-slate-900">
              <LocalTime iso={job.completedAt} />
            </dd>
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
        {manualStartMessage && (
          <p className="mt-3 rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm font-medium text-brand-800">
            {manualStartMessage}
          </p>
        )}
      </Card>

      {hasBambuFile && (
        <Card>
          <CardHeader>
            <CardTitle>AMS Requirements</CardTitle>
          </CardHeader>
          <AmsSlotCards slots={job.amsSlots} />
        </Card>
      )}

      {confirmation && (
        <Card>
          <CardHeader>
            <CardTitle>Bed-Clear Confirmation</CardTitle>
          </CardHeader>
          <p className="text-sm text-slate-600">
            Confirmed by {nameFor(confirmation.confirmed_by)} at{' '}
            <LocalTime iso={confirmation.created_at} />
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
                <span className="text-slate-400">
                  <LocalTime iso={e.created_at} />
                </span>{' '}
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
