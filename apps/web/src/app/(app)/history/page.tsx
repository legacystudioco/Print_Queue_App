import { HistoryCard } from '@/components/history/HistoryCard';
import { EmptyState } from '@/components/ui/States';
import { getCurrentAppUser } from '@/lib/server/auth';
import { getAppUsersByIds, getHistory, getPrimaryPrinter } from '@/lib/server/data';
import { getPrintFileAvailability } from '@/lib/server/storage';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const supabase = await createSupabaseServerClient();
  const [user, printer] = await Promise.all([getCurrentAppUser(), getPrimaryPrinter(supabase)]);

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

  // Requeue is admin-only (same gating as every other queue-mutating action
  // — see QueueCard), so only admins need the file-availability check that
  // decides whether their Requeue button is enabled.
  const isAdmin = user?.role === 'admin';
  const availability = isAdmin
    ? await getPrintFileAvailability(supabase, jobs.map((j) => j.storagePath))
    : null;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">History</h1>
      {jobs.length === 0 ? (
        <EmptyState title="No print history yet" description="Completed, failed, and skipped prints appear here." />
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <HistoryCard
              key={job.id}
              job={job}
              creatorName={nameFor(job.createdBy)}
              isAdmin={isAdmin}
              fileAvailable={availability?.get(job.storagePath) ?? true}
            />
          ))}
        </div>
      )}
    </div>
  );
}
