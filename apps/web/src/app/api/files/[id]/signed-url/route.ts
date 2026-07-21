import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { PRINT_FILES_BUCKET } from '@/lib/client/uploadPrintFile';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const SIGNED_URL_TTL_SECONDS = 60;

/** id = print job id (not the file itself), so we control access via the job row. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin');
    const { id } = await params;
    const admin = createSupabaseAdminClient();

    const { data: job, error } = await admin
      .from('print_jobs')
      .select('storage_path')
      .eq('id', id)
      .single();

    if (error || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const { data: signed, error: signError } = await admin.storage
      .from(PRINT_FILES_BUCKET)
      .createSignedUrl(job.storage_path, SIGNED_URL_TTL_SECONDS);

    if (signError || !signed) {
      return NextResponse.json({ error: 'Could not create signed URL' }, { status: 500 });
    }

    return NextResponse.json({ url: signed.signedUrl, expiresInSeconds: SIGNED_URL_TTL_SECONDS });
  } catch (err) {
    return handleApiError(err);
  }
}
