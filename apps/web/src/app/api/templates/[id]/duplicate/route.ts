import { duplicateJobTemplateSchema } from '@print-queue/shared';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { buildScreenshotPath } from '@/lib/client/uploadJobScreenshot';
import { copyScreenshot, deleteScreenshotsBestEffort } from '@/lib/server/templateStorage';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/templates/[id]/duplicate — an independent copy of a template
 * and every one of its plates, ready to rename. Every plate's screenshot is
 * copied to a fresh storage object first (see templateStorage.ts) so the
 * copy never shares an object with the source — editing/deleting either
 * template afterward can't affect the other.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole('admin');
    const { id } = await params;

    const rate = checkRateLimit(`duplicate-template:${user.id}`, { limit: 20, windowMs: 60_000 });
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Too many requests, slow down.' }, { status: 429 });
    }

    const body = await request.json();
    const parsed = duplicateJobTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.flatten() }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();

    const { data: source, error: fetchError } = await admin
      .from('job_templates')
      .select('id, name, plates:job_template_plates(id, screenshot_path, sort_order)')
      .eq('id', id)
      .single();

    if (fetchError || !source) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const { newTemplateId, name } = parsed.data;
    const orderedSourcePlates = [...source.plates].sort((a, b) => a.sort_order - b.sort_order);

    const copiedPaths: string[] = [];
    const plates: { id: string; screenshotPath: string | null }[] = [];

    try {
      for (const plate of orderedSourcePlates) {
        const newPlateId = randomUUID();
        if (plate.screenshot_path) {
          const toPath = buildScreenshotPath(`templates/${newTemplateId}`, plate.screenshot_path.split('/').pop() ?? 'screenshot');
          await copyScreenshot(admin, plate.screenshot_path, toPath);
          copiedPaths.push(toPath);
          plates.push({ id: newPlateId, screenshotPath: toPath });
        } else {
          plates.push({ id: newPlateId, screenshotPath: null });
        }
      }
    } catch (copyErr) {
      await deleteScreenshotsBestEffort(admin, copiedPaths);
      throw copyErr;
    }

    const { data, error } = await admin.rpc('duplicate_job_template', {
      p_new_template_id: newTemplateId,
      p_source_template_id: id,
      p_new_name: name ?? `${source.name} Copy`,
      p_plates: plates,
    });

    if (error) {
      await deleteScreenshotsBestEffort(admin, copiedPaths);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ template: data }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
