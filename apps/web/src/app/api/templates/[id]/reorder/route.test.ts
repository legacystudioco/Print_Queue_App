import type { AppUser } from '@print-queue/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN: AppUser = { id: 'admin-1', email: 'a@example.com', displayName: 'Admin', role: 'admin', active: true };
const TEMPLATE_ID = 'template-1';
const PLATE_A = crypto.randomUUID();
const PLATE_B = crypto.randomUUID();
const PLATE_C = crypto.randomUUID();

vi.mock('@/lib/server/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/auth')>();
  return { ...actual, requireRole: vi.fn() };
});

const rpc = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => ({ rpc }) }));

import { requireRole, UnauthorizedError } from '@/lib/server/auth';
import { POST } from './route';

function request(body: unknown) {
  return new Request(`http://localhost/api/templates/${TEMPLATE_ID}/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: TEMPLATE_ID });

beforeEach(() => {
  rpc.mockReset();
  vi.mocked(requireRole).mockReset();
  vi.mocked(requireRole).mockResolvedValue(ADMIN);
});

describe('POST /api/templates/[id]/reorder', () => {
  it('returns 401 when the caller is not authenticated', async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());
    const res = await POST(request({ orderedPlateIds: [PLATE_A, PLATE_B] }), { params });
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns 400 for an empty ordered list', async () => {
    const res = await POST(request({ orderedPlateIds: [] }), { params });
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('calls reorder_template_plates with the template id and the given order', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const res = await POST(request({ orderedPlateIds: [PLATE_B, PLATE_A, PLATE_C] }), { params });

    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('reorder_template_plates', {
      p_template_id: TEMPLATE_ID,
      p_ordered_plate_ids: [PLATE_B, PLATE_A, PLATE_C],
    });
  });

  it('surfaces a mismatched-id-set RPC error as 409', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Ordered plate list does not match' } });
    const res = await POST(request({ orderedPlateIds: [PLATE_A] }), { params });
    expect(res.status).toBe(409);
  });
});
