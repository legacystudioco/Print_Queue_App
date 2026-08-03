import { randomUUID } from 'node:crypto';
import { createPartialReprintSchema } from '@print-queue/shared';
import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/jobs/[id]/partial-reprint — the follow-up job created after a
 * Partial print (see PartialReprintDialog). Doesn't send its own
 * notification — marking the source job Partial (POST .../status) already
 * sends `partial_created`, and this step is an optional continuation of
 * that same event, not a second one.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole('admin');
    const { id } = await params;

    const rate = checkRateLimit(`partial-reprint:${user.id}`, { limit: 20, windowMs: 60_000 });
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Too many requests, slow down.' }, { status: 429 });
    }

    const body = await request.json();
    const parsed = createPartialReprintSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.flatten() }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: job, error } = await admin.rpc('create_partial_reprint', {
      p_new_id: randomUUID(),
      p_source_job_id: id,
      p_screenshot_path: parsed.data.screenshotPath,
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
