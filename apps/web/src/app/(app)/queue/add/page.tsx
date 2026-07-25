import { redirect } from 'next/navigation';
import { getCurrentAppUser } from '@/lib/server/auth';
import { getAllPrinters } from '@/lib/server/data';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { EmptyState } from '@/components/ui/States';
import { AddPrintForm } from './AddPrintForm';

export const dynamic = 'force-dynamic';

export default async function AddPrintPage() {
  const user = await getCurrentAppUser();
  if (!user) return null;
  if (user.role !== 'admin') redirect('/queue');

  const supabase = await createSupabaseServerClient();
  const printers = await getAllPrinters(supabase);

  if (printers.length === 0) {
    return <EmptyState title="No printer configured" description="Add a printer row in Supabase first." />;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Add Print</h1>
      <AddPrintForm printers={printers} />
    </div>
  );
}
