import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { checkRateLimit } from '@/lib/server/rate-limit';
import {
  PlateNotEligibleForRequeueError,
  PlateNotFoundError,
  ScreenshotUnavailableError,
  requeuePlateFromHistory,
} from '@/lib/server/queue';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole('admin');
    const { id } = await params;

    const rate = checkRateLimit(`requeue-plate:${user.id}`, { limit: 20, windowMs: 60_000 });
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Too many requests, slow down.' }, { status: 429 });
    }

    const admin = createSupabaseAdminClient();
    const result = await requeuePlateFromHistory(admin, id);

    console.info('Plate requeued from history', {
      originalPlateId: result.originalPlateId,
      newPlateId: result.newPlate.id,
      userId: user.id,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ plate: result.newPlate }, { status: 201 });
  } catch (err) {
    if (err instanceof PlateNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof PlateNotEligibleForRequeueError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof ScreenshotUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error('Failed to requeue plate from history', err);
    return handleApiError(err);
  }
}
