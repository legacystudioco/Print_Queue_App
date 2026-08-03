import { notFound, redirect } from 'next/navigation';
import { getCurrentAppUser } from '@/lib/server/auth';
import { getBoardJob } from '@/lib/server/data';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { EditJobForm } from './EditJobForm';

export const dynamic = 'force-dynamic';

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentAppUser();
  if (!user) return null;
  if (user.role !== 'admin') redirect('/queue');

  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const job = await getBoardJob(supabase, id);
  if (!job) notFound();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Edit Job</h1>
      <EditJobForm job={job} />
    </div>
  );
}
