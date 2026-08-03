import { updateBoardJobSchema } from '@print-queue/shared';
import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin');
    const { id } = await params;

    const body = await request.json();
    const parsed = updateBoardJobSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.flatten() }, { status: 400 });
    }

    const { name, colors, estimatedDurationSeconds, notes, screenshotPath } = parsed.data;
    const admin = createSupabaseAdminClient();

    const { error } = await admin
      .from('print_jobs')
      .update({
        ...(name !== undefined ? { name } : {}),
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
