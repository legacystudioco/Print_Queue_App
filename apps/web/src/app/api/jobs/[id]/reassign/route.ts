import { reassignJobPrinterSchema } from '@print-queue/shared';
import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/** "Move To": reassign a not-yet-started job to a different printer whose brand has an uploaded file on it. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin');
    const { id } = await params;

    const body = await request.json();
    const parsed = reassignJobPrinterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid reassignment payload', issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc('reassign_job_printer', {
      p_job_id: id,
      p_new_printer_id: parsed.data.newPrinterId,
    });

    if (error) {
      const status = error.code === 'P0002' ? 404 : 409;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ job: data });
  } catch (err) {
    return handleApiError(err);
  }
}
