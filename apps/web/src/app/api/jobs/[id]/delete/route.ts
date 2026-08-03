import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { JOB_SCREENSHOTS_BUCKET } from '@/lib/client/uploadJobScreenshot';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const TERMINAL_BOARD_STATUSES = ['partial', 'completed'];

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin');
    const { id } = await params;
    const confirm = new URL(request.url).searchParams.get('confirm') === 'true';
    const admin = createSupabaseAdminClient();

    const { data: job, error: fetchError } = await admin
      .from('print_jobs')
      .select('id, board_status, screenshot_path')
      .eq('id', id)
      .single();

    if (fetchError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const isHistory = TERMINAL_BOARD_STATUSES.includes(job.board_status);
    if (isHistory && !confirm) {
      return NextResponse.json(
        {
          error: 'This job is already in history. Confirm deletion to permanently remove it.',
          requiresConfirmation: true,
        },
        { status: 409 },
      );
    }

    const { error: deleteError } = await admin.from('print_jobs').delete().eq('id', id);
    if (deleteError) throw deleteError;

    if (job.screenshot_path) {
      await admin.storage.from(JOB_SCREENSHOTS_BUCKET).remove([job.screenshot_path]);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
