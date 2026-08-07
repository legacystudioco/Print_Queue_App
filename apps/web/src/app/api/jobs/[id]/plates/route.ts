import { addPlateSchema } from '@print-queue/shared';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/jobs/[id]/plates — add a plate to an existing customer/order
 * later, without recreating the customer. Deliberately does not touch the
 * job's completed_at/queue_position (see recompute_job_completed_at,
 * migration 0018 — adding a plate to a job already filed in History does
 * not move it back to the Board).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole('admin');
    const { id } = await params;

    const rate = checkRateLimit(`add-plate:${user.id}`, { limit: 40, windowMs: 60_000 });
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Too many requests, slow down.' }, { status: 429 });
    }

    const body = await request.json();
    const parsed = addPlateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.flatten() }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: plate, error } = await admin.rpc('add_plate_to_job', {
      p_plate_id: randomUUID(),
      p_job_id: id,
      p_plate_name: parsed.data.plateName,
      p_screenshot_path: parsed.data.screenshotPath,
      p_colors: (parsed.data.colors ?? null) as string,
      p_estimated_duration_seconds: (parsed.data.estimatedDurationSeconds ?? null) as number,
      p_notes: (parsed.data.notes ?? null) as string,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json({ plate }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
