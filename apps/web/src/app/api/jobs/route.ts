import { createPrintJobSchema } from '@print-queue/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ForbiddenError, requireRole, UnauthorizedError } from '@/lib/server/auth';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const createJobRequestSchema = createPrintJobSchema.and(
  z.object({
    jobId: z.string().uuid(),
    printerId: z.string().uuid(),
    storagePath: z.string().min(1),
  }),
);

export async function POST(request: Request) {
  try {
    const user = await requireRole('admin');

    const rate = checkRateLimit(`create-job:${user.id}`, { limit: 20, windowMs: 60_000 });
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Too many requests, slow down.' }, { status: 429 });
    }

    const body = await request.json();
    const parsed = createJobRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid job payload', issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { jobId, printerId, storagePath, amsSlots, ...job } = parsed.data;

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc('create_print_job', {
      p_id: jobId,
      p_printer_id: printerId,
      p_name: job.name,
      p_original_filename: job.originalFilename,
      p_storage_path: storagePath,
      p_file_size_bytes: job.fileSizeBytes,
      p_estimated_duration_seconds: job.estimatedDurationSeconds ?? null,
      p_notes: job.notes ?? null,
      p_created_by: user.id,
      p_ams_slots: amsSlots.map((slot, index) => ({
        slot_number: index + 1,
        is_used: slot.isUsed,
        color_name: slot.isUsed ? (slot.colorName ?? null) : null,
        material_name: slot.isUsed ? (slot.materialName ?? null) : null,
        notes: slot.notes ?? null,
      })),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ job: data }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}
