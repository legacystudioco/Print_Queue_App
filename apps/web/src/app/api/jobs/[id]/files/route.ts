import { addJobFileSchema } from '@print-queue/shared';
import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/** "Add Printer File": attach (or replace) one brand's file on an existing job. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin');
    const { id } = await params;

    const body = await request.json();
    const parsed = addJobFileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid file payload', issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc('add_job_file', {
      p_job_id: id,
      p_printer_brand: parsed.data.printerBrand,
      p_filename: parsed.data.filename,
      p_storage_path: parsed.data.storagePath,
      p_file_size_bytes: parsed.data.fileSizeBytes,
    });

    if (error) {
      const status = error.code === 'P0002' ? 404 : 409;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ file: data }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
