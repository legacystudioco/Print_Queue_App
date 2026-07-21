import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin');
    const { id } = await params;
    const admin = createSupabaseAdminClient();

    const { error } = await admin.rpc('retry_print_job', { p_job_id: id });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
