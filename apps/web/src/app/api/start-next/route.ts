import { startNextJobSchema } from '@print-queue/shared';
import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { getPrimaryPrinter } from '@/lib/server/data';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * The single most safety-critical route in the app: turns an operator's
 * checklist confirmation into a printer_commands row the bridge will act
 * on. All real invariants (queue position, no other active command,
 * idempotency) are enforced inside the `start_next_print` Postgres
 * function under row locks — this route only handles auth, validation,
 * and rate limiting, then reports whatever the DB decided.
 */
export async function POST(request: Request) {
  try {
    const user = await requireRole('admin', 'operator');

    const rate = checkRateLimit(`start-next:${user.id}`, { limit: 10, windowMs: 60_000 });
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Too many requests, slow down.' }, { status: 429 });
    }

    const body = await request.json();
    const parsed = startNextJobSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Checklist incomplete or payload invalid', issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const admin = createSupabaseAdminClient();
    const printer = await getPrimaryPrinter(admin);
    if (!printer) {
      return NextResponse.json({ error: 'No printer configured' }, { status: 404 });
    }

    const { jobId, checklist, idempotencyKey } = parsed.data;

    const { data, error } = await admin.rpc('start_next_print', {
      p_job_id: jobId,
      p_printer_id: printer.id,
      p_requested_by: user.id,
      p_idempotency_key: idempotencyKey,
      p_previous_print_removed: checklist.previousPrintRemoved,
      p_build_plate_clear: checklist.buildPlateClear,
      p_ams_verified: checklist.amsVerified,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json({ command: data }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
