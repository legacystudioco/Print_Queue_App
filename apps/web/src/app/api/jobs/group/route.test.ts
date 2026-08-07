import type { AppUser } from '@print-queue/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN: AppUser = { id: 'admin-1', email: 'a@example.com', displayName: 'Admin', role: 'admin', active: true };

vi.mock('@/lib/server/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/auth')>();
  return { ...actual, requireRole: vi.fn() };
});

const rpc = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ rpc }),
}));

import { requireRole, UnauthorizedError } from '@/lib/server/auth';
import { POST } from './route';

function request(body: unknown) {
  return new Request('http://localhost/api/jobs/group', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    jobId: crypto.randomUUID(),
    customerName: 'Hug',
    business: '3d_sports_displays',
    notes: null,
    sourceJobIds: [crypto.randomUUID(), crypto.randomUUID()],
    ...overrides,
  };
}

beforeEach(() => {
  rpc.mockReset();
  vi.mocked(requireRole).mockReset();
  vi.mocked(requireRole).mockResolvedValue(ADMIN);
});

describe('POST /api/jobs/group', () => {
  it('returns 401 when the caller is not authenticated', async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());
    const res = await POST(request(validPayload()));
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns 400 for a payload with no source job ids', async () => {
    const res = await POST(request(validPayload({ sourceJobIds: [] })));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('calls group_jobs_into_new_job with the parsed payload and returns the new job', async () => {
    rpc.mockResolvedValue({ data: { id: 'new-job', customer_name: 'Hug' }, error: null });
    const payload = validPayload();

    const res = await POST(request(payload));

    expect(res.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith('group_jobs_into_new_job', {
      p_new_job_id: payload.jobId,
      p_customer_name: 'Hug',
      p_business: '3d_sports_displays',
      p_notes: null,
      p_created_by: ADMIN.id,
      p_source_job_ids: payload.sourceJobIds,
    });
    const body = await res.json();
    expect(body.job).toEqual({ id: 'new-job', customer_name: 'Hug' });
  });

  it('surfaces an RPC error (e.g. a selected job is not standalone) as 409 without a second write attempt', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Job is not standalone' } });

    const res = await POST(request(validPayload()));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('Job is not standalone');
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
