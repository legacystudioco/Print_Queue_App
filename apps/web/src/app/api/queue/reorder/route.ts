import { reorderJobsQueueSchema } from '@print-queue/shared';
import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/** POST /api/queue/reorder — reorder customer cards within one business's active queue. */
export async function POST(request: Request) {
  try {
    await requireRole('admin');

    const body = await request.json();
    const parsed = reorderJobsQueueSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid reorder payload' }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();

    const { error } = await admin.rpc('reorder_jobs_queue', {
      p_business: parsed.data.business,
      p_ordered_job_ids: parsed.data.orderedJobIds,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
