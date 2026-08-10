import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { buildScreenshotPath } from '@/lib/client/uploadJobScreenshot';
import { copyScreenshot, deleteScreenshotsBestEffort } from '@/lib/server/templateStorage';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/templates/[id]/plates/[plateId]/duplicate — copy a template
 * plate within the same template. Unlike `duplicate_plate` (which reuses
 * the source job plate's screenshot object), the screenshot is copied to a
 * fresh object first — every template plate owns its screenshot
 * independently, so deleting either the source or the copy later is always
 * safe (see migration 0020's header comment).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; plateId: string }> }) {
  try {
    const user = await requireRole('admin');
    const { id, plateId } = await params;

    const rate = checkRateLimit(`duplicate-template-plate:${user.id}`, { limit: 40, windowMs: 60_000 });
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Too many requests, slow down.' }, { status: 429 });
    }

    const admin = createSupabaseAdminClient();

    const { data: source, error: fetchError } = await admin
      .from('job_template_plates')
      .select('id, screenshot_path')
      .eq('id', plateId)
      .single();

    if (fetchError || !source) {
      return NextResponse.json({ error: 'Template plate not found' }, { status: 404 });
    }

    let newPath: string | null = null;
    if (source.screenshot_path) {
      newPath = buildScreenshotPath(`templates/${id}`, source.screenshot_path.split('/').pop() ?? 'screenshot');
      await copyScreenshot(admin, source.screenshot_path, newPath);
    }

    const { data, error } = await admin.rpc('duplicate_template_plate', {
      p_new_plate_id: randomUUID(),
      p_source_plate_id: plateId,
      p_screenshot_path: newPath as string,
    });

    if (error) {
      if (newPath) await deleteScreenshotsBestEffort(admin, [newPath]);
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json({ plate: data }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
