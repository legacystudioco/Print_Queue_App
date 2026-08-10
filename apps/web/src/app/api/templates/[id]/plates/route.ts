import { addTemplatePlateSchema } from '@print-queue/shared';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/** POST /api/templates/[id]/plates — "Add Plate" on an existing template. The client uploads the screenshot (if any) directly to templates/{id}/... first. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin');
    const { id } = await params;

    const body = await request.json();
    const parsed = addTemplatePlateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.flatten() }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc('add_template_plate', {
      p_plate_id: randomUUID(),
      p_template_id: id,
      p_plate_name: parsed.data.plateName,
      p_screenshot_path: (parsed.data.screenshotPath ?? null) as string,
      p_colors: (parsed.data.colors ?? null) as string,
      p_estimated_duration_seconds: (parsed.data.estimatedDurationSeconds ?? null) as number,
      p_notes: (parsed.data.notes ?? null) as string,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json({ plate: data }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
