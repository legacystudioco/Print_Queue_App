import { EmptyState } from '@/components/ui/States';
import { getCurrentAppUser } from '@/lib/server/auth';
import { getCurrentJob, getNextEligibleJob, getPrimaryPrinter } from '@/lib/server/data';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { StartNextClient } from './StartNextClient';

export const dynamic = 'force-dynamic';

export default async function StartNextPage() {
  const user = await getCurrentAppUser();
  if (!user) return null;

  const supabase = await createSupabaseServerClient();
  const printer = await getPrimaryPrinter(supabase);

  if (!printer) {
    return <EmptyState title="No printer configured" description="Add a printer row in Supabase first." />;
  }

  const currentJob = await getCurrentJob(supabase, printer.id);

  if (currentJob) {
    return (
      <EmptyState
        title="A print is already in progress"
        description={`"${currentJob.name}" is currently ${currentJob.status}. Wait for it to finish before starting the next print.`}
      />
    );
  }

  const nextJob = await getNextEligibleJob(supabase, printer.id);

  if (!nextJob) {
    return <EmptyState title="Queue is empty" description="Add a print to the queue to get started." />;
  }

  return <StartNextClient job={nextJob} printerId={printer.id} />;
}
