import { updateJobTemplateSchema } from '@print-queue/shared';
import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { getJobTemplateWithPlates } from '@/lib/server/data';
import { JOB_SCREENSHOTS_BUCKET } from '@/lib/client/uploadJobScreenshot';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/** GET /api/templates/[id] — the template detail/edit page, and the source for "Create Job from Template". */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin');
    const { id } = await params;

    const admin = createSupabaseAdminClient();
    const template = await getJobTemplateWithPlates(admin, id);
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({ template });
  } catch (err) {
    return handleApiError(err);
  }
}

/** PATCH /api/templates/[id] — edit metadata, and/or archive (`archived: true`) or restore (`archived: false`) it. Never touches jobs already created from this template. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin');
    const { id } = await params;

    const body = await request.json();
    const parsed = updateJobTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.flatten() }, { status: 400 });
    }

    const { name, description, defaultBusiness, archived } = parsed.data;
    const admin = createSupabaseAdminClient();

    const { error } = await admin
      .from('job_templates')
      .update({
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(defaultBusiness !== undefined ? { default_business: defaultBusiness } : {}),
        ...(archived !== undefined ? { archived_at: archived ? new Date().toISOString() : null } : {}),
      })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * DELETE /api/templates/[id] — permanently delete a template and every one
 * of its plates (cascade). Safe to hard-delete unconditionally: every
 * template plate's screenshot is an independent storage object (see
 * migration 0020's header comment) that no job ever shares, so removing
 * them here can never orphan or break a job's screenshot.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin');
    const { id } = await params;
    const admin = createSupabaseAdminClient();

    const { data: template, error: fetchError } = await admin
      .from('job_templates')
      .select('id, plates:job_template_plates(screenshot_path)')
      .eq('id', id)
      .single();

    if (fetchError || !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const { error: deleteError } = await admin.from('job_templates').delete().eq('id', id);
    if (deleteError) throw deleteError;

    const screenshotPaths = template.plates
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
