import { randomUUID } from 'node:crypto';
import { createPlateReprintSchema } from '@print-queue/shared';
import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/plates/[id]/reprint — the follow-up plate created after a
 * Partial print (see PartialReprintDialog). Doesn't send its own
 * notification — marking the source plate Partial (POST .../status)
 * already sends `partial_created`, and this step is an optional
 * continuation of that same event, not a second one.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole('admin');
    const { id } = await params;

    const rate = checkRateLimit(`plate-reprint:${user.id}`, { limit: 20, windowMs: 60_000 });
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Too many requests, slow down.' }, { status: 429 });
    }

    const body = await request.json();
    const parsed = createPlateReprintSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.flatten() }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: plate, error } = await admin.rpc('create_plate_reprint', {
      p_new_plate_id: randomUUID(),
      p_source_plate_id: id,
      p_screenshot_path: parsed.data.screenshotPath,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json({ plate }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
