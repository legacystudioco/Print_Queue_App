import { setJobBoardStatusSchema } from '@print-queue/shared';
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
    const parsed = setJobBoardStatusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.flatten() }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: job, error } = await admin.rpc('set_job_board_status', {
      p_job_id: id,
      p_new_status: parsed.data.status,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    if (job) {
      if (parsed.data.status === 'completed') {
        await notifyJobEvent(admin, {
          jobId: job.id,
          type: 'job_completed',
          title: '✅ Job completed',
          body: `${job.name} is done printing.`,
          url: `/jobs/${job.id}`,
        }).catch((err) => console.error('Failed to send job_completed notification', err));
      } else if (parsed.data.status === 'partial') {
        await notifyJobEvent(admin, {
          jobId: job.id,
          type: 'partial_created',
          title: '⚠️ Marked Partial',
          body: `${job.name} had a partial failure — review it for a reprint.`,
          url: `/jobs/${job.id}`,
        }).catch((err) => console.error('Failed to send partial_created notification', err));
      }
    }

    return NextResponse.json({ job });
  } catch (err) {
    return handleApiError(err);
  }
}
