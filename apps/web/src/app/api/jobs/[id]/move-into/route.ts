import { moveJobIntoJobSchema } from '@print-queue/shared';
import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/jobs/[id]/move-into — "Move into Job…", merging this job's
 * plate(s) into an existing target job (see move_job_into_job, migration
 * 0019). Plate names are preserved as-is; the source job is deleted once
 * its plates have been moved out.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin');
    const { id } = await params;

    const body = await request.json();
    const parsed = moveJobIntoJobSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.flatten() }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: job, error } = await admin.rpc('move_job_into_job', {
      p_source_job_id: id,
      p_target_job_id: parsed.data.targetJobId,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json({ job });
  } catch (err) {
    return handleApiError(err);
  }
}
