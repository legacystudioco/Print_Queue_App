import { businessLabels, moveJobBusinessSchema } from '@print-queue/shared';
import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { notifyJobEvent } from '@/lib/server/notifications';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

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
    const { data: job, error } = await admin.rpc('move_job_to_business', {
      p_job_id: id,
      p_new_business: parsed.data.business,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    if (job) {
      await notifyJobEvent(admin, {
        jobId: job.id,
        type: 'job_moved',
        title: '↔️ Job moved',
        body: `${job.name} moved to ${businessLabels[parsed.data.business]}.`,
        url: `/jobs/${job.id}`,
      }).catch((err) => console.error('Failed to send job_moved notification', err));
    }

    return NextResponse.json({ job });
  } catch (err) {
    return handleApiError(err);
  }
}
