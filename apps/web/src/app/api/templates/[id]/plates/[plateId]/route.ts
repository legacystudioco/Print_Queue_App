import { updateTemplatePlateSchema } from '@print-queue/shared';
import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { JOB_SCREENSHOTS_BUCKET } from '@/lib/client/uploadJobScreenshot';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/** PATCH /api/templates/[id]/plates/[plateId] — edit a single template plate. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; plateId: string }> }) {
  try {
    await requireRole('admin');
    const { plateId } = await params;

    const body = await request.json();
    const parsed = updateTemplatePlateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.flatten() }, { status: 400 });
    }

    const { plateName, colors, estimatedDurationSeconds, notes, screenshotPath } = parsed.data;
    const admin = createSupabaseAdminClient();

    const { error } = await admin
      .from('job_template_plates')
      .update({
        ...(plateName !== undefined ? { plate_name: plateName } : {}),
        ...(colors !== undefined ? { colors } : {}),
        ...(estimatedDurationSeconds !== undefined ? { estimated_duration_seconds: estimatedDurationSeconds } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(screenshotPath !== undefined ? { screenshot_path: screenshotPath } : {}),
      })
      .eq('id', plateId);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * DELETE /api/templates/[id]/plates/[plateId] — remove a single plate from
 * a template. Unlike DELETE /api/plates/[id], there's no "last plate"
 * invariant — a template can go down to 0 plates. Unconditional screenshot
 * removal is safe: template plates never share a storage object (see
 * migration 0020's header comment).
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; plateId: string }> }) {
  try {
    await requireRole('admin');
    const { plateId } = await params;
    const admin = createSupabaseAdminClient();

    const { data: plate, error: fetchError } = await admin
      .from('job_template_plates')
      .select('id, screenshot_path')
      .eq('id', plateId)
      .single();

    if (fetchError || !plate) {
      return NextResponse.json({ error: 'Template plate not found' }, { status: 404 });
    }

    const { error: deleteError } = await admin.from('job_template_plates').delete().eq('id', plateId);
    if (deleteError) throw deleteError;

    if (plate.screenshot_path) {
      await admin.storage.from(JOB_SCREENSHOTS_BUCKET).remove([plate.screenshot_path]);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
