import { HistoryCard } from '@/components/history/HistoryCard';
import { EmptyState } from '@/components/ui/States';
import { getCurrentAppUser } from '@/lib/server/auth';
import { getAppUsersByIds, getBoardHistory } from '@/lib/server/data';
import { getScreenshotAvailability } from '@/lib/server/storage';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const supabase = await createSupabaseServerClient();
  const [user, jobs] = await Promise.all([getCurrentAppUser(), getBoardHistory(supabase)]);

  const users = await getAppUsersByIds(
    supabase,
    [...new Set(jobs.map((j) => j.createdBy))],
  );
  const nameFor = (id: string) =>
    users.find((u) => u.id === id)?.display_name ?? users.find((u) => u.id === id)?.email ?? 'Unknown';

  // Requeue is admin-only (same gating as every other board-mutating action
  // — see JobCard), so only admins need the screenshot-availability check
  // that decides whether their Requeue button is enabled.
  const isAdmin = user?.role === 'admin';
  const availability = isAdmin
    ? await getScreenshotAvailability(
        supabase,
        jobs.map((job) => job.screenshotPath).filter((path): path is string => path !== null),
      )
    : null;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">History</h1>
      {jobs.length === 0 ? (
        <EmptyState title="No history yet" description="Partial and completed jobs appear here." />
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <HistoryCard
              key={job.id}
              job={job}
              creatorName={nameFor(job.createdBy)}
              isAdmin={isAdmin}
              screenshotAvailable={
                job.screenshotPath !== null && (availability?.get(job.screenshotPath) ?? true)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
