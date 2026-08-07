import type { AppUser } from '@print-queue/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN: AppUser = { id: 'admin-1', email: 'a@example.com', displayName: 'Admin', role: 'admin', active: true };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function request() {
  return new Request('http://localhost/api/plates/plate-extras/remove-from-job', { method: 'POST' });
}

const params = Promise.resolve({ id: 'plate-extras' });

beforeEach(() => {
  rpc.mockReset();
  vi.mocked(requireRole).mockReset();
  vi.mocked(requireRole).mockResolvedValue(ADMIN);
});

describe('POST /api/plates/[id]/remove-from-job', () => {
  it('returns 401 when the caller is not authenticated', async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());
    const res = await POST(request(), { params });
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('calls remove_plate_from_job with a freshly generated job id, the plate id from the URL, and the caller — no request body needed', async () => {
    rpc.mockResolvedValue({ data: { id: 'new-job', customer_name: 'Extras' }, error: null });

    const res = await POST(request(), { params });

    expect(res.status).toBe(201);
    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe('remove_plate_from_job');
    expect(args.p_plate_id).toBe('plate-extras');
    expect(args.p_created_by).toBe(ADMIN.id);
    expect(args.p_new_job_id).toMatch(UUID_RE);

    const body = await res.json();
    expect(body.job).toEqual({ id: 'new-job', customer_name: 'Extras' });
  });

  it('surfaces an RPC error (e.g. the only plate on its job) as 409 without a second write attempt', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'This is the only plate on its job — it is already standalone' } });

    const res = await POST(request(), { params });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already standalone/i);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
