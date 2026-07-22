import { CheckCircle2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/States';
import { getCurrentAppUser } from '@/lib/server/auth';
import { getCompletedJobName, getCurrentJob, getNextEligibleJob, getPrimaryPrinter } from '@/lib/server/data';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { StartNextClient } from './StartNextClient';

export const dynamic = 'force-dynamic';

/**
 * `completedJobId` arrives from the "Print complete" push notification's
 * click target (see apps/bridge/src/statusReporter.ts and public/sw.js) —
 * showing the name of the print that just finished here confirms to
 * whoever tapped the notification that they landed in the right place.
 */
export default async function StartNextPage({
  searchParams,
}: {
  searchParams: Promise<{ completedJobId?: string }>;
}) {
  const user = await getCurrentAppUser();
  if (!user) return null;

  const { completedJobId } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const printer = await getPrimaryPrinter(supabase);

  if (!printer) {
    return <EmptyState title="No printer configured" description="Add a printer row in Supabase first." />;
  }

  const completedJobName = completedJobId ? await getCompletedJobName(supabase, completedJobId) : null;
  const banner = completedJobName && (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-success-100 bg-success-50 p-3 text-sm text-success-700">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        <strong>&quot;{completedJobName}&quot;</strong> just finished. Remove it from the printer before
        starting the next job.
      </span>
    </div>
  );

  const currentJob = await getCurrentJob(supabase, printer.id);

  if (currentJob) {
    return (
      <div>
        {banner}
        <EmptyState
          title="A print is already in progress"
          description={`"${currentJob.name}" is currently ${currentJob.status}. Wait for it to finish before starting the next print.`}
        />
      </div>
    );
  }

  const nextJob = await getNextEligibleJob(supabase, printer.id);

  if (!nextJob) {
    return (
      <div>
        {banner}
        <EmptyState title="Queue is empty" description="Add a print to the queue to get started." />
      </div>
    );
  }

  return (
    <div>
      {banner}
      <StartNextClient job={nextJob} printerId={printer.id} />
    </div>
  );
}
