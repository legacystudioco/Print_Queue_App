import { setPlateStatusSchema } from '@print-queue/shared';
import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { notifyPlateEvent } from '@/lib/server/notifications';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/** POST /api/plates/[id]/status — Start Printing / Complete / Partial. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin');
    const { id } = await params;

    const body = await request.json();
    const parsed = setPlateStatusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.flatten() }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: plate, error } = await admin.rpc('set_plate_status', {
      p_plate_id: id,
      p_new_status: parsed.data.status,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    if (plate) {
      if (parsed.data.status === 'completed') {
        await notifyPlateEvent(admin, {
          plateId: plate.id,
          jobId: plate.job_id,
          plateName: plate.plate_name,
          type: 'job_completed',
          title: '✅ Plate completed',
          body: `${plate.plate_name} is done printing.`,
          url: `/jobs/${plate.job_id}`,
        }).catch((err) => console.error('Failed to send job_completed notification', err));
      } else if (parsed.data.status === 'partial') {
        await notifyPlateEvent(admin, {
          plateId: plate.id,
          jobId: plate.job_id,
          plateName: plate.plate_name,
          type: 'partial_created',
          title: '⚠️ Marked Partial',
          body: `${plate.plate_name} had a partial failure — review it for a reprint.`,
          url: `/jobs/${plate.job_id}`,
        }).catch((err) => console.error('Failed to send partial_created notification', err));
      }
    }

    return NextResponse.json({ plate });
  } catch (err) {
    return handleApiError(err);
  }
}
