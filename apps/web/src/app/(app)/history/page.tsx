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
  // — see PlateRow), so only admins need the screenshot-availability check
  // that decides whether each plate's Requeue button is enabled.
  const isAdmin = user?.role === 'admin';
  const screenshotAvailabilityMap = isAdmin
    ? await getScreenshotAvailability(
        supabase,
        jobs.flatMap((job) => job.plates.map((plate) => plate.screenshotPath)).filter((path): path is string => path !== null),
      )
    : null;
  const screenshotAvailableByPath = Object.fromEntries(screenshotAvailabilityMap ?? []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">History</h1>
      {jobs.length === 0 ? (
        <EmptyState title="No history yet" description="Customer orders with partial or completed plates appear here." />
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <HistoryCard
              key={job.id}
              job={job}
              creatorName={nameFor(job.createdBy)}
              isAdmin={isAdmin}
              screenshotAvailableByPath={screenshotAvailableByPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}
