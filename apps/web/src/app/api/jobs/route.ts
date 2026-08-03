import { createBoardJobSchema } from '@print-queue/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ForbiddenError, requireRole, UnauthorizedError } from '@/lib/server/auth';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const createJobRequestSchema = createBoardJobSchema.and(
  z.object({
    jobId: z.string().uuid(),
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

    const { jobId, ...job } = parsed.data;

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc('create_board_job', {
      p_id: jobId,
      p_name: job.name,
      p_business: job.business,
      p_screenshot_path: job.screenshotPath,
      // Generated RPC arg types don't carry nullability (Postgres function
      // signatures don't expose it) even though these params happily accept
      // NULL — see create_board_job in supabase/migrations.
      p_colors: (job.colors ?? null) as string,
      p_estimated_duration_seconds: (job.estimatedDurationSeconds ?? null) as number,
      p_notes: (job.notes ?? null) as string,
      p_created_by: user.id,
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
