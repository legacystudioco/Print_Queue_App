import { businessLabels, formatPrintTime } from '@print-queue/shared';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Edit } from 'lucide-react';
import { StatusBadge } from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { LocalTime } from '@/components/ui/LocalTime';
import { getCurrentAppUser } from '@/lib/server/auth';
import { getAppUsersByIds, getBoardJobWithLineage, getQueuePosition } from '@/lib/server/data';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { JobDetailActions } from './JobDetailActions';

export const dynamic = 'force-dynamic';

export default async function JobDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const [user, lineage] = await Promise.all([getCurrentAppUser(), getBoardJobWithLineage(supabase, id)]);
  if (!lineage) notFound();
  const { job, parent, children } = lineage;

  const [queuePosition, users] = await Promise.all([
    getQueuePosition(supabase, id),
    getAppUsersByIds(supabase, [job.createdBy]),
  ]);
  const creatorName = users.find((u) => u.id === job.createdBy)?.display_name ?? users[0]?.email ?? 'Unknown';
  const isAdmin = user?.role === 'admin';

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-charcoal-900">{job.name}</h1>
          <p className="text-sm text-charcoal-400">{businessLabels[job.business]}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={job.status} />
          {isAdmin && (
            <Link
              href={`/jobs/${job.id}/edit`}
              aria-label="Edit job"
              className="touch-target inline-flex h-8 w-8 items-center justify-center rounded-lg border border-charcoal-300 text-charcoal-700 hover:border-charcoal-500 hover:bg-charcoal-50"
            >
              <Edit className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>

      {job.screenshotUrl && (
        <Card className="p-0 overflow-hidden">
          <div className="relative aspect-video w-full bg-charcoal-100">
            <Image src={job.screenshotUrl} alt={`Build plate for ${job.name}`} fill className="object-contain" unoptimized />
          </div>
        </Card>
      )}

      {isAdmin && <JobDetailActions job={job} />}

      {(parent || children.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Reprint Lineage</CardTitle>
          </CardHeader>
          <div className="space-y-1 text-sm">
            {parent && (
              <p>
                Reprint of{' '}
                <Link href={`/jobs/${parent.id}`} className="font-medium text-accent-600 hover:underline">
                  {parent.name}
                </Link>
              </p>
            )}
            {children.map((child) => (
              <p key={child.id}>
                Reprint created:{' '}
                <Link href={`/jobs/${child.id}`} className="font-medium text-accent-600 hover:underline">
                  {child.name}
                </Link>
              </p>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Job Details</CardTitle>
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
            <dt className="text-slate-500">Colors / materials</dt>
            <dd className="font-medium text-slate-900">{job.colors || '—'}</dd>
          </div>
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
            <dt className="text-slate-500">Completed</dt>
            <dd className="font-medium text-slate-900">
              <LocalTime iso={job.completedAt} />
            </dd>
          </div>
        </dl>
        {job.notes && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{job.notes}</p>}
      </Card>
    </div>
  );
}
