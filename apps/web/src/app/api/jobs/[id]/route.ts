import { updateJobSchema } from '@print-queue/shared';
import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { JOB_SCREENSHOTS_BUCKET } from '@/lib/client/uploadJobScreenshot';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/** PATCH /api/jobs/[id] — edit the customer/order (name, business notes). Plates are edited via /api/plates/[id]. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin');
    const { id } = await params;

    const body = await request.json();
    const parsed = updateJobSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.flatten() }, { status: 400 });
    }

    const { customerName, notes, shipByDate } = parsed.data;
    const admin = createSupabaseAdminClient();

    const { error } = await admin
      .from('jobs')
      .update({
        ...(customerName !== undefined ? { customer_name: customerName } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(shipByDate !== undefined ? { ship_by_date: shipByDate } : {}),
      })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * DELETE /api/jobs/[id] — delete a customer/order and every one of its
 * plates (cascade). Mirrors the old single-job delete's confirmation gate:
 * a job already filed in History (completed_at set) requires ?confirm=true
 * before it's permanently removed.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin');
    const { id } = await params;
    const confirm = new URL(request.url).searchParams.get('confirm') === 'true';
    const admin = createSupabaseAdminClient();

    const { data: job, error: fetchError } = await admin
      .from('jobs')
      .select('id, completed_at, plates(screenshot_path)')
      .eq('id', id)
      .single();

    if (fetchError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const isHistory = job.completed_at !== null;
    if (isHistory && !confirm) {
      return NextResponse.json(
        {
          error: 'This customer is already in history. Confirm deletion to permanently remove it.',
          requiresConfirmation: true,
        },
        { status: 409 },
      );
    }

    const { error: deleteError } = await admin.from('jobs').delete().eq('id', id);
    if (deleteError) throw deleteError;

    const screenshotPaths = job.plates
      .map((plate) => plate.screenshot_path)
      .filter((path): path is string => path !== null);
    if (screenshotPaths.length > 0) {
      await admin.storage.from(JOB_SCREENSHOTS_BUCKET).remove(screenshotPaths);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
