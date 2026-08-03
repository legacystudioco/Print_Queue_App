import { redirect } from 'next/navigation';
import { getCurrentAppUser } from '@/lib/server/auth';
import { AddJobForm } from './AddJobForm';

export const dynamic = 'force-dynamic';

export default async function AddJobPage() {
  const user = await getCurrentAppUser();
  if (!user) return null;
  if (user.role !== 'admin') redirect('/queue');

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Add Job</h1>
      <AddJobForm />
    </div>
  );
}
