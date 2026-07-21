import { reorderQueueSchema } from '@print-queue/shared';
import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { getPrimaryPrinter } from '@/lib/server/data';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  try {
    await requireRole('admin');

    const body = await request.json();
    const parsed = reorderQueueSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid reorder payload' }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const printer = await getPrimaryPrinter(admin);
    if (!printer) {
      return NextResponse.json({ error: 'No printer configured' }, { status: 404 });
    }

    const { error } = await admin.rpc('reorder_queue', {
      p_printer_id: printer.id,
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
