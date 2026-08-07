import { businessLabels, businesses } from '@print-queue/shared';
import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireAppUser } from '@/lib/server/auth';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { sendQueueSummaryNotification } from '@/lib/server/notifications';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/** POST /api/notifications/queue-summary — Settings' "Send Queue Summary Now" button. */
export async function POST() {
  try {
    const user = await requireAppUser();

    const rate = checkRateLimit(`queue-summary:${user.id}`, { limit: 10, windowMs: 60_000 });
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Too many requests, slow down.' }, { status: 429 });
    }

    const admin = createSupabaseAdminClient();
    const { data: plates, error } = await admin
      .from('plates')
      .select('status, jobs(business)')
      .in('status', ['queued', 'printing']);
    if (error) throw error;

    const lines = businesses.map((business) => {
      const businessPlates = (plates ?? []).filter((p) => p.jobs?.business === business);
      const printing = businessPlates.filter((p) => p.status === 'printing').length;
      const queued = businessPlates.filter((p) => p.status === 'queued').length;
      return `${businessLabels[business]}: ${queued} queued, ${printing} printing`;
    });

    const result = await sendQueueSummaryNotification(admin, lines.join(' · '));

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return handleApiError(err);
  }
}
