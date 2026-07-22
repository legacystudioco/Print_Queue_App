import Link from 'next/link';
import { StatusBadge, jobDisplayStatus } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/States';
import { LocalTime } from '@/components/ui/LocalTime';
import { getAppUsersByIds, getHistory, getPrimaryPrinter } from '@/lib/server/data';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function formatDuration(startedAt: string | null, completedAt: string | null) {
  if (!startedAt || !completedAt) return '—';
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms <= 0) return '—';
  const minutes = Math.round(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

export default async function HistoryPage() {
  const supabase = await createSupabaseServerClient();
  const printer = await getPrimaryPrinter(supabase);

  if (!printer) {
    return <EmptyState title="No printer configured" description="Add a printer row in Supabase first." />;
  }

  const jobs = await getHistory(supabase, printer.id);
  const users = await getAppUsersByIds(
    supabase,
    [...new Set(jobs.map((j) => j.createdBy))],
  );
  const nameFor = (id: string) =>
    users.find((u) => u.id === id)?.display_name ?? users.find((u) => u.id === id)?.email ?? 'Unknown';

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">History</h1>
      {jobs.length === 0 ? (
        <EmptyState title="No print history yet" description="Completed, failed, and skipped prints appear here." />
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <Link key={job.id} href={`/jobs/${job.id}`}>
              <Card className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">{job.name}</p>
                  <StatusBadge status={jobDisplayStatus(job.status, job)} />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span>
                    Started <LocalTime iso={job.startedAt} />
                  </span>
                  <span>Duration {formatDuration(job.startedAt, job.completedAt)}</span>
                  <span>By {nameFor(job.createdBy)}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
