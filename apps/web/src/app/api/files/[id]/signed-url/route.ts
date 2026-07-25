import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { PRINT_FILES_BUCKET } from '@/lib/client/uploadPrintFile';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const SIGNED_URL_TTL_SECONDS = 60;

/** id = job_files id (one specific printer-brand file, not the job itself). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin');
    const { id } = await params;
    const admin = createSupabaseAdminClient();

    const { data: file, error } = await admin
      .from('job_files')
      .select('storage_path')
      .eq('id', id)
      .single();

    if (error || !file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const { data: signed, error: signError } = await admin.storage
      .from(PRINT_FILES_BUCKET)
      .createSignedUrl(file.storage_path, SIGNED_URL_TTL_SECONDS);

    if (signError || !signed) {
      return NextResponse.json({ error: 'Could not create signed URL' }, { status: 500 });
    }

    return NextResponse.json({ url: signed.signedUrl, expiresInSeconds: SIGNED_URL_TTL_SECONDS });
  } catch (err) {
    return handleApiError(err);
  }
}
