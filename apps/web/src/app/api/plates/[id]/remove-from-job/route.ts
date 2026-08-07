import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/plates/[id]/remove-from-job — "Remove from Job", splitting this
 * plate back out into its own standalone job (see remove_plate_from_job,
 * migration 0019). No body: the new job's business and customer name are
 * derived automatically from the plate's current job and its own
 * plate_name, keeping this a true one-click action. Blocked (409) when the
 * plate is the only plate on its job — it's already standalone.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole('admin');
    const { id } = await params;

    const admin = createSupabaseAdminClient();
    const { data: job, error } = await admin.rpc('remove_plate_from_job', {
      p_new_job_id: randomUUID(),
      p_plate_id: id,
      p_created_by: user.id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json({ job }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
