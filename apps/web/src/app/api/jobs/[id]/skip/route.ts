import { assertCanTransitionJobStatus, IllegalJobStatusTransitionError } from '@print-queue/shared';
import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin');
    const { id } = await params;
    const admin = createSupabaseAdminClient();

    const { data: job, error: fetchError } = await admin
      .from('print_jobs')
      .select('id, status')
      .eq('id', id)
      .single();

    if (fetchError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    assertCanTransitionJobStatus(job.status, 'skipped');

    const { error: updateError } = await admin
      .from('print_jobs')
      .update({ status: 'skipped' })
      .eq('id', id);

    if (updateError) throw updateError;

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof IllegalJobStatusTransitionError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return handleApiError(err);
  }
}
