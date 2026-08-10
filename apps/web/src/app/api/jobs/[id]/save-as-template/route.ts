import { saveJobAsTemplateSchema } from '@print-queue/shared';
import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { buildScreenshotPath } from '@/lib/client/uploadJobScreenshot';
import { copyScreenshot, deleteScreenshotsBestEffort } from '@/lib/server/templateStorage';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/jobs/[id]/save-as-template — the fastest path from an existing
 * production job to a reusable template. Only production-neutral fields
 * (plate name/screenshot/colors/time/notes/order) are copied — status,
 * completed_at, and reprint lineage are deliberately left behind, so the
 * new template's plates start as neutral reusable definitions. Every kept
 * plate's screenshot is copied to a fresh object under
 * templates/{newId}/... first, so the template is fully independent of
 * this job from the moment it's created.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole('admin');
    const { id: jobId } = await params;

    const rate = checkRateLimit(`save-as-template:${user.id}`, { limit: 20, windowMs: 60_000 });
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Too many requests, slow down.' }, { status: 429 });
    }

    const body = await request.json();
    const parsed = saveJobAsTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.flatten() }, { status: 400 });
    }

    const { templateId, name, description, defaultBusiness, plateIds } = parsed.data;
    const admin = createSupabaseAdminClient();

    const { data: job, error: fetchError } = await admin
      .from('jobs')
      .select('id, plates(id, plate_name, screenshot_path, colors, estimated_duration_seconds, notes, sort_order)')
      .eq('id', jobId)
      .single();

    if (fetchError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const plateIdSet = new Set(plateIds);
    const keptPlates = job.plates
      .filter((plate) => plateIdSet.has(plate.id))
      .sort((a, b) => a.sort_order - b.sort_order);

    if (keptPlates.length === 0) {
      return NextResponse.json({ error: 'Select at least one plate to save' }, { status: 400 });
    }

    const copiedPaths: string[] = [];
    const platesPayload: {
      plateName: string;
      screenshotPath: string | null;
      colors: string | null;
      estimatedDurationSeconds: number | null;
      notes: string | null;
    }[] = [];

    try {
      for (const plate of keptPlates) {
        let screenshotPath: string | null = null;
        if (plate.screenshot_path) {
          screenshotPath = buildScreenshotPath(`templates/${templateId}`, plate.screenshot_path.split('/').pop() ?? 'screenshot');
          await copyScreenshot(admin, plate.screenshot_path, screenshotPath);
          copiedPaths.push(screenshotPath);
        }

        platesPayload.push({
          plateName: plate.plate_name,
          screenshotPath,
          colors: plate.colors,
          estimatedDurationSeconds: plate.estimated_duration_seconds,
          notes: plate.notes,
        });
      }
    } catch (copyErr) {
      await deleteScreenshotsBestEffort(admin, copiedPaths);
      throw copyErr;
    }

    const { data, error } = await admin.rpc('create_job_template', {
      p_template_id: templateId,
      p_name: name,
      p_description: (description ?? null) as string,
      p_default_business: defaultBusiness,
      p_plates: platesPayload,
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
