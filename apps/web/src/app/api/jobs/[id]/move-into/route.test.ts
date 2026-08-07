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
  return new Request('http://localhost/api/jobs/job-extras/move-into', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: 'job-extras' });

beforeEach(() => {
  rpc.mockReset();
  vi.mocked(requireRole).mockReset();
  vi.mocked(requireRole).mockResolvedValue(ADMIN);
});

describe('POST /api/jobs/[id]/move-into', () => {
  it('returns 401 when the caller is not authenticated', async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());
    const res = await POST(request({ targetJobId: crypto.randomUUID() }), { params });
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns 400 when targetJobId is missing', async () => {
    const res = await POST(request({}), { params });
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('calls move_job_into_job with the source (from the URL) and target (from the body), returning the target job', async () => {
    rpc.mockResolvedValue({ data: { id: 'job-hug', customer_name: 'Hug' }, error: null });
    const targetJobId = crypto.randomUUID();

    const res = await POST(request({ targetJobId }), { params });

    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('move_job_into_job', {
      p_source_job_id: 'job-extras',
      p_target_job_id: targetJobId,
    });
    const body = await res.json();
    expect(body.job).toEqual({ id: 'job-hug', customer_name: 'Hug' });
  });

  it('surfaces an RPC error (e.g. moving a job into itself) as 409 without a second write attempt', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Cannot move a job into itself' } });

    const res = await POST(request({ targetJobId: crypto.randomUUID() }), { params });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('Cannot move a job into itself');
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
