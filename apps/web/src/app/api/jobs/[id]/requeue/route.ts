import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { checkRateLimit } from '@/lib/server/rate-limit';
import {
  JobNotEligibleForRequeueError,
  JobNotFoundError,
  ScreenshotUnavailableError,
  requeueBoardJobFromHistory,
} from '@/lib/server/queue';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole('admin');
    const { id } = await params;

    const rate = checkRateLimit(`requeue-job:${user.id}`, { limit: 20, windowMs: 60_000 });
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Too many requests, slow down.' }, { status: 429 });
    }

    const admin = createSupabaseAdminClient();
    const result = await requeueBoardJobFromHistory(admin, id, user.id);

    console.info('Job requeued from history', {
      originalJobId: result.originalJobId,
      newJobId: result.newJob.id,
      userId: user.id,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ job: result.newJob }, { status: 201 });
  } catch (err) {
    if (err instanceof JobNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof JobNotEligibleForRequeueError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof ScreenshotUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error('Failed to requeue job from history', err);
    return handleApiError(err);
  }
}
