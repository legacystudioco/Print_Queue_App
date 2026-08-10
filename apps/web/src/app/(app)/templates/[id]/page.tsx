import { notFound } from 'next/navigation';
import { TemplateDetail } from '@/components/templates/TemplateDetail';
import { getCurrentAppUser } from '@/lib/server/auth';
import { getJobTemplateWithPlates } from '@/lib/server/data';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function TemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const [user, template] = await Promise.all([getCurrentAppUser(), getJobTemplateWithPlates(supabase, id)]);

  if (!user) return null;
  if (!template) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <TemplateDetail initialTemplate={template} isAdmin={user.role === 'admin'} />
    </div>
  );
}
