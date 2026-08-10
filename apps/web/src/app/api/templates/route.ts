import { createJobTemplateSchema } from '@print-queue/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError } from '@/lib/server/api-errors';
import { requireRole } from '@/lib/server/auth';
import { getJobTemplates } from '@/lib/server/data';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const createJobTemplateRequestSchema = createJobTemplateSchema.and(
  z.object({
    templateId: z.string().uuid(),
  }),
);

/** GET /api/templates — the Template Library page and the "Create Job from Template" picker's candidate list. */
export async function GET(request: Request) {
  try {
    await requireRole('admin');

    const url = new URL(request.url);
    const q = url.searchParams.get('q') ?? undefined;
    const includeArchived = url.searchParams.get('includeArchived') === 'true';

    const admin = createSupabaseAdminClient();
    const templates = await getJobTemplates(admin, { q, includeArchived });

    return NextResponse.json({ templates });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * POST /api/templates — manual "Create Template". Plates arrive with
 * screenshotPaths the client already uploaded directly to
 * `templates/{templateId}/...` (fresh uploads never need a server-side
 * copy — see lib/server/templateStorage.ts). 0 plates is valid; a template
 * can be built up one plate at a time afterward via "Add Plate".
 */
export async function POST(request: Request) {
  try {
    const user = await requireRole('admin');

    const rate = checkRateLimit(`create-template:${user.id}`, { limit: 20, windowMs: 60_000 });
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Too many requests, slow down.' }, { status: 429 });
    }

    const body = await request.json();
    const parsed = createJobTemplateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid template payload', issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { templateId, plates, ...template } = parsed.data;

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc('create_job_template', {
      p_template_id: templateId,
      p_name: template.name,
      // See create_job_with_plates's identical comment in POST /api/jobs — the generated RPC arg type doesn't carry nullability.
      p_description: (template.description ?? null) as string,
      p_default_business: template.defaultBusiness,
      p_plates: plates,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ template: data }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
