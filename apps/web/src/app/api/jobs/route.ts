import { businessSchema, createJobSchema, jobStatusSchema } from '@print-queue/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError } from '@/lib/server/api-errors';
import { ForbiddenError, requireRole, UnauthorizedError } from '@/lib/server/auth';
import { searchJobs } from '@/lib/server/data';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const createJobRequestSchema = createJobSchema.and(
  z.object({
    jobId: z.string().uuid(),
  }),
);

/**
 * GET /api/jobs — search/filter jobs. Powers the "Group Existing Jobs"
 * wizard's candidate list (?standaloneOnly=true — only jobs with exactly
 * one plate) and "Move into Job"'s target list (?excludeId=<source> — any
 * job). Admin-gated like every other route here, keeping the whole
 * group/move/split feature admin-only end to end.
 */
export async function GET(request: Request) {
  try {
    await requireRole('admin');

    const url = new URL(request.url);
    const q = url.searchParams.get('q') ?? undefined;
    const businessParam = url.searchParams.get('business');
    const statusParam = url.searchParams.get('status');
    const standaloneOnly = url.searchParams.get('standaloneOnly') === 'true';
    const excludeJobId = url.searchParams.get('excludeId') ?? undefined;

    const business = businessParam ? businessSchema.safeParse(businessParam) : undefined;
    if (business && !business.success) {
      return NextResponse.json({ error: 'Invalid business filter' }, { status: 400 });
    }

    const status = statusParam ? jobStatusSchema.safeParse(statusParam) : undefined;
    if (status && !status.success) {
      return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const jobs = await searchJobs(admin, {
      q,
      business: business?.data,
      status: status?.data,
      standaloneOnly,
      excludeJobId,
    });

    return NextResponse.json({ jobs });
  } catch (err) {
    return handleApiError(err);
  }
}

/** POST /api/jobs — create a customer/order together with all of its plates (1–20) in one save. */
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

    const { jobId, plates, ...job } = parsed.data;

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc('create_job_with_plates', {
      p_job_id: jobId,
      p_customer_name: job.customerName,
      p_business: job.business,
      // Generated RPC arg types don't carry nullability (Postgres function
      // signatures don't expose it) even though this param happily accepts
      // NULL — see create_job_with_plates in supabase/migrations.
      p_notes: (job.notes ?? null) as string,
      p_created_by: user.id,
      p_plates: plates,
      p_ship_by_date: (job.shipByDate ?? null) as string,
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
