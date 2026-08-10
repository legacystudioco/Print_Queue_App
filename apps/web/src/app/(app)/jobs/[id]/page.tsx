import { businessLabels, deriveJobStatus, formatPrintTime, summarizePlateCounts, summarizePlateTime } from '@print-queue/shared';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Edit } from 'lucide-react';
import { StatusBadge } from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { LocalTime } from '@/components/ui/LocalTime';
import { ShipByLine } from '@/components/ui/ShipByLine';
import { JobDetailPlates } from './JobDetailPlates';
import { getCurrentAppUser } from '@/lib/server/auth';
import { getAppUsersByIds, getJobWithPlates, getQueuePosition } from '@/lib/server/data';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { JobDetailActions } from './JobDetailActions';

export const dynamic = 'force-dynamic';

export default async function JobDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const [user, job] = await Promise.all([getCurrentAppUser(), getJobWithPlates(supabase, id)]);
  if (!job) notFound();

  const [queuePosition, users] = await Promise.all([
    getQueuePosition(supabase, id),
    getAppUsersByIds(supabase, [job.createdBy]),
  ]);
  const creatorName = users.find((u) => u.id === job.createdBy)?.display_name ?? users[0]?.email ?? 'Unknown';
  const isAdmin = user?.role === 'admin';

  const status = deriveJobStatus(job.plates.map((p) => p.status));
  const counts = summarizePlateCounts(job.plates);
  const time = summarizePlateTime(job.plates);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-charcoal-900">{job.customerName}</h1>
          <p className="text-sm text-charcoal-400">{businessLabels[job.business]}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={status} />
          {isAdmin && (
            <Link
              href={`/jobs/${job.id}/edit`}
              aria-label="Edit customer"
              className="touch-target inline-flex h-8 w-8 items-center justify-center rounded-lg border border-charcoal-300 text-charcoal-700 hover:border-charcoal-500 hover:bg-charcoal-50"
            >
              <Edit className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Progress</CardTitle>
        </CardHeader>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-slate-500">Plates</dt>
            <dd className="font-medium text-slate-900">
              {counts.completed} / {counts.total} complete
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Total time</dt>
            <dd className="font-medium text-slate-900">{formatPrintTime(time.totalMinutes)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Completed time</dt>
            <dd className="font-medium text-slate-900">{formatPrintTime(time.completedMinutes)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Remaining time</dt>
            <dd className="font-medium text-slate-900">{formatPrintTime(time.remainingMinutes)}</dd>
          </div>
        </dl>
        {job.queuePosition !== null && (
          <p className="mt-3 text-xs text-slate-500">Queue position: {queuePosition ?? job.queuePosition}</p>
        )}
      </Card>

      {job.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Order Notes</CardTitle>
          </CardHeader>
          <p className="text-sm text-slate-700">{job.notes}</p>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Plates</CardTitle>
        </CardHeader>
        <JobDetailPlates job={job} isAdmin={isAdmin} />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Order Details</CardTitle>
        </CardHeader>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-slate-500">Created by</dt>
            <dd className="font-medium text-slate-900">{creatorName}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Created</dt>
            <dd className="font-medium text-slate-900">
              <LocalTime iso={job.createdAt} />
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">In History since</dt>
            <dd className="font-medium text-slate-900">
              <LocalTime iso={job.completedAt} />
            </dd>
          </div>
          {job.shipByDate && (
            <div>
              <dt className="text-slate-500">Ship by</dt>
              <dd className="font-medium text-slate-900">
                <ShipByLine shipByDate={job.shipByDate} completed={job.completedAt !== null} />
              </dd>
            </div>
          )}
        </dl>
      </Card>

      {isAdmin && <JobDetailActions job={job} />}
    </div>
  );
}
