import { updatePlateSchema } from '@print-queue/shared';
import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { JOB_SCREENSHOTS_BUCKET } from '@/lib/client/uploadJobScreenshot';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/** PATCH /api/plates/[id] — edit a single plate. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin');
    const { id } = await params;

    const body = await request.json();
    const parsed = updatePlateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.flatten() }, { status: 400 });
    }

    const { plateName, colors, estimatedDurationSeconds, notes, screenshotPath } = parsed.data;
    const admin = createSupabaseAdminClient();

    const { error } = await admin
      .from('plates')
      .update({
        ...(plateName !== undefined ? { plate_name: plateName } : {}),
        ...(colors !== undefined ? { colors } : {}),
        ...(estimatedDurationSeconds !== undefined ? { estimated_duration_seconds: estimatedDurationSeconds } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(screenshotPath !== undefined ? { screenshot_path: screenshotPath } : {}),
      })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * DELETE /api/plates/[id] — delete a single plate. Blocked (409) if it's
 * the last remaining plate under its job — a job can never be left with 0
 * plates (product decision); the caller should use "Delete Customer"
 * (DELETE /api/jobs/[id]) instead.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin');
    const { id } = await params;
    const admin = createSupabaseAdminClient();

    const { data: plate, error: fetchError } = await admin
      .from('plates')
      .select('id, job_id, screenshot_path')
      .eq('id', id)
      .single();

    if (fetchError || !plate) {
      return NextResponse.json({ error: 'Plate not found' }, { status: 404 });
    }

    const { count, error: countError } = await admin
      .from('plates')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', plate.job_id);

    if (countError) throw countError;

    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        {
          error: 'This is the last plate on this customer\'s order. Delete the customer instead.',
        },
        { status: 409 },
      );
    }

    const { error: deleteError } = await admin.from('plates').delete().eq('id', id);
    if (deleteError) throw deleteError;

    if (plate.screenshot_path) {
      await admin.storage.from(JOB_SCREENSHOTS_BUCKET).remove([plate.screenshot_path]);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
