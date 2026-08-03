import { ProductionBoard } from '@/components/board/ProductionBoard';
import { getCurrentAppUser } from '@/lib/server/auth';
import { getBoardJobs } from '@/lib/server/data';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function QueuePage() {
  const supabase = await createSupabaseServerClient();
  const [user, jobs] = await Promise.all([getCurrentAppUser(), getBoardJobs(supabase)]);

  if (!user) return null;

  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen">
      <div className="mx-auto max-w-[1600px] px-4 md:px-6">
        <ProductionBoard initialJobs={jobs} user={user} />
      </div>
    </div>
  );
}
