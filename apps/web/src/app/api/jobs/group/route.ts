import { groupJobsSchema } from '@print-queue/shared';
import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/jobs/group — the "Group Existing Jobs" wizard's Step 3 confirm.
 * Merges one or more standalone jobs (each must currently have exactly one
 * plate — enforced by group_jobs_into_new_job, migration 0019) into a new
 * job, one plate per source job, preserving each plate's screenshot,
 * status, timestamps, and history (a job_id reassignment, not a copy).
 */
export async function POST(request: Request) {
  try {
    const user = await requireRole('admin');

    const rate = checkRateLimit(`group-jobs:${user.id}`, { limit: 10, windowMs: 60_000 });
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Too many requests, slow down.' }, { status: 429 });
    }

    const body = await request.json();
    const parsed = groupJobsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.flatten() }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: job, error } = await admin.rpc('group_jobs_into_new_job', {
      p_new_job_id: parsed.data.jobId,
      p_customer_name: parsed.data.customerName,
      p_business: parsed.data.business,
      // Generated RPC arg types don't carry nullability even though this
      // param happily accepts NULL — see create_job_with_plates in
      // apps/web/src/app/api/jobs/route.ts for the same idiom.
      p_notes: (parsed.data.notes ?? null) as string,
      p_created_by: user.id,
      p_source_job_ids: parsed.data.sourceJobIds,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json({ job }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
