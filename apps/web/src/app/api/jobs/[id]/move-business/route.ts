import { businessLabels, moveJobBusinessSchema } from '@print-queue/shared';
import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { notifyJobMoved } from '@/lib/server/notifications';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/** POST /api/jobs/[id]/move-business — drag a customer card to the other business column. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin');
    const { id } = await params;

    const body = await request.json();
    const parsed = moveJobBusinessSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.flatten() }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: job, error } = await admin.rpc('reassign_job_business', {
      p_job_id: id,
      p_new_business: parsed.data.business,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    if (job) {
      await notifyJobMoved(admin, {
        jobId: job.id,
        jobName: job.customer_name,
        title: '↔️ Job moved',
        body: `${job.customer_name} moved to ${businessLabels[parsed.data.business]}.`,
        url: `/jobs/${job.id}`,
      }).catch((err) => console.error('Failed to send job_moved notification', err));
    }

    return NextResponse.json({ job });
  } catch (err) {
    return handleApiError(err);
  }
}
