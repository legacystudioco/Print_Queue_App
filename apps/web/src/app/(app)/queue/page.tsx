import Link from 'next/link';
import { QueueList } from '@/components/queue/QueueList';
import { EmptyState } from '@/components/ui/States';
import { getCurrentAppUser } from '@/lib/server/auth';
import { getActiveQueue, getPrimaryPrinter } from '@/lib/server/data';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function QueuePage() {
  const supabase = await createSupabaseServerClient();
  const [user, printer] = await Promise.all([getCurrentAppUser(), getPrimaryPrinter(supabase)]);

  if (!user) return null;

  if (!printer) {
    return <EmptyState title="No printer configured" description="Add a printer row in Supabase." />;
  }

  const jobs = await getActiveQueue(supabase, printer.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Print Queue</h1>
        {user.role === 'admin' && (
          <Link
            href="/queue/add"
            className="touch-target rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 flex items-center"
          >
            + Add Print
          </Link>
        )}
      </div>
      <QueueList initialJobs={jobs} user={user} printerId={printer.id} />
    </div>
  );
}
