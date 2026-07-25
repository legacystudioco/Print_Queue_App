import { terminalPrintJobStatuses } from '@print-queue/shared';
import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { PRINT_FILES_BUCKET } from '@/lib/client/uploadPrintFile';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin');
    const { id } = await params;
    const confirm = new URL(request.url).searchParams.get('confirm') === 'true';
    const admin = createSupabaseAdminClient();

    const { data: job, error: fetchError } = await admin
      .from('print_jobs')
      .select('id, status')
      .eq('id', id)
      .single();

    if (fetchError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const isHistory = terminalPrintJobStatuses.includes(job.status);
    if (isHistory && !confirm) {
      return NextResponse.json(
        {
          error: 'This job is already in history. Confirm deletion to permanently remove it.',
          requiresConfirmation: true,
        },
        { status: 409 },
      );
    }

    const { data: files, error: filesError } = await admin
      .from('job_files')
      .select('storage_path')
      .eq('job_id', id);
    if (filesError) throw filesError;

    const { error: deleteError } = await admin.from('print_jobs').delete().eq('id', id);
    if (deleteError) throw deleteError;

    if (files.length > 0) {
      await admin.storage.from(PRINT_FILES_BUCKET).remove(files.map((f) => f.storage_path));
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
