import { createJobFromTemplateSchema } from '@print-queue/shared';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { buildScreenshotPath } from '@/lib/client/uploadJobScreenshot';
import { copyScreenshot, deleteScreenshotsBestEffort } from '@/lib/server/templateStorage';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/templates/[id]/jobs — "Create Job from Template," the whole
 * point of the feature. The template is a reusable recipe; the created job
 * is a snapshot — every plate's screenshot becomes an independent copy (or
 * the client's own freshly-uploaded replacement) so nothing about the job
 * changes if the template is edited or deleted later. Once every screenshot
 * is resolved, this delegates to the *existing* create_job_with_plates RPC
 * unchanged — the database doesn't need to know a job came from a template.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole('admin');
    const { id: templateId } = await params;

    const rate = checkRateLimit(`create-job-from-template:${user.id}`, { limit: 20, windowMs: 60_000 });
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Too many requests, slow down.' }, { status: 429 });
    }

    const body = await request.json();
    const parsed = createJobFromTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.flatten() }, { status: 400 });
    }

    const { jobId, customerName, business, notes, shipByDate, plates } = parsed.data;
    const admin = createSupabaseAdminClient();

    const { data: templatePlates, error: fetchError } = await admin
      .from('job_template_plates')
      .select('id, screenshot_path')
      .eq('template_id', templateId)
      .in(
        'id',
        plates.map((p) => p.templatePlateId),
      );

    if (fetchError) throw fetchError;

    const templatePlateById = new Map((templatePlates ?? []).map((p) => [p.id, p]));
    for (const plate of plates) {
      if (!templatePlateById.has(plate.templatePlateId)) {
        return NextResponse.json({ error: 'One or more plates no longer belong to this template' }, { status: 409 });
      }
    }

    const copiedPaths: string[] = [];
    const platesPayload: {
      id: string;
      plateName: string;
      screenshotPath: string;
      colors: string | null;
      estimatedDurationSeconds: number | null;
      notes: string | null;
    }[] = [];

    try {
      for (const plate of plates) {
        let screenshotPath = plate.screenshotPath ?? null;

        if (!screenshotPath) {
          const templatePlate = templatePlateById.get(plate.templatePlateId)!;
          if (!templatePlate.screenshot_path) {
            return NextResponse.json(
              { error: `Add a screenshot for plate "${plate.plateName}"` },
              { status: 400 },
            );
          }
          screenshotPath = buildScreenshotPath(jobId, templatePlate.screenshot_path.split('/').pop() ?? 'screenshot');
          await copyScreenshot(admin, templatePlate.screenshot_path, screenshotPath);
          copiedPaths.push(screenshotPath);
        }

        platesPayload.push({
          id: randomUUID(),
          plateName: plate.plateName,
          screenshotPath,
          colors: plate.colors ?? null,
          estimatedDurationSeconds: plate.estimatedDurationSeconds ?? null,
          notes: plate.notes ?? null,
        });
      }
    } catch (copyErr) {
      await deleteScreenshotsBestEffort(admin, copiedPaths);
      throw copyErr;
    }

    const { data, error } = await admin.rpc('create_job_with_plates', {
      p_job_id: jobId,
      p_customer_name: customerName,
      p_business: business,
      p_notes: (notes ?? null) as string,
      p_created_by: user.id,
      p_plates: platesPayload,
      p_ship_by_date: (shipByDate ?? null) as string,
    });

    if (error) {
      await deleteScreenshotsBestEffort(admin, copiedPaths);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ job: data }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
