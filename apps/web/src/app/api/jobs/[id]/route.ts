import { updatePrintJobSchema } from '@print-queue/shared';
import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin');
    const { id } = await params;

    const body = await request.json();
    const parsed = updatePrintJobSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.flatten() }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { name, estimatedDurationSeconds, notes, amsSlots } = parsed.data;

    const { error: jobError } = await admin
      .from('print_jobs')
      .update({
        ...(name !== undefined ? { name } : {}),
        ...(estimatedDurationSeconds !== undefined ? { estimated_duration_seconds: estimatedDurationSeconds } : {}),
        ...(notes !== undefined ? { notes } : {}),
      })
      .eq('id', id);

    if (jobError) throw jobError;

    if (amsSlots) {
      const rows = amsSlots.map((slot, index) => ({
        job_id: id,
        slot_number: index + 1,
        is_used: slot.isUsed,
        color_name: slot.isUsed ? (slot.colorName ?? null) : null,
        material_name: slot.isUsed ? (slot.materialName ?? null) : null,
        notes: slot.notes ?? null,
      }));
      const { error: slotsError } = await admin
        .from('job_ams_slots')
        .upsert(rows, { onConflict: 'job_id,slot_number' });
      if (slotsError) throw slotsError;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
