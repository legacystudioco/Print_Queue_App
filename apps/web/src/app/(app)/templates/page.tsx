import { TemplateLibrary } from '@/components/templates/TemplateLibrary';
import { getCurrentAppUser } from '@/lib/server/auth';
import { getJobTemplates } from '@/lib/server/data';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  const supabase = await createSupabaseServerClient();
  const [user, templates] = await Promise.all([getCurrentAppUser(), getJobTemplates(supabase)]);

  if (!user) return null;

  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen">
      <div className="mx-auto max-w-[1600px] px-4 md:px-6">
        <TemplateLibrary initialTemplates={templates} isAdmin={user.role === 'admin'} />
      </div>
    </div>
  );
}
