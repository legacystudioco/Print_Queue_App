import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/** POST /api/plates/[id]/duplicate — copy a plate under the same job, reset to queued, no lineage link. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole('admin');
    const { id } = await params;

    const rate = checkRateLimit(`duplicate-plate:${user.id}`, { limit: 40, windowMs: 60_000 });
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Too many requests, slow down.' }, { status: 429 });
    }

    const admin = createSupabaseAdminClient();
    const { data: plate, error } = await admin.rpc('duplicate_plate', {
      p_new_plate_id: randomUUID(),
      p_source_plate_id: id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json({ plate }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
