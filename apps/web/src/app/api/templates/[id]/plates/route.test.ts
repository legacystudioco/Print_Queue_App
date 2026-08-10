import type { AppUser } from '@print-queue/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN: AppUser = { id: 'admin-1', email: 'a@example.com', displayName: 'Admin', role: 'admin', active: true };
const TEMPLATE_ID = 'template-1';

vi.mock('@/lib/server/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/auth')>();
  return { ...actual, requireRole: vi.fn() };
});

const rpc = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => ({ rpc }) }));

import { requireRole, UnauthorizedError } from '@/lib/server/auth';
import { POST } from './route';

function request(body: unknown) {
  return new Request(`http://localhost/api/templates/${TEMPLATE_ID}/plates`, {
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

describe('POST /api/templates/[id]/plates', () => {
  it('returns 401 when the caller is not authenticated', async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());
    const res = await POST(request({ plateName: 'Extras' }), { params });
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('allows a plate with no screenshot yet', async () => {
    rpc.mockResolvedValue({ data: { id: 'plate-1' }, error: null });
    const res = await POST(request({ plateName: 'Extras' }), { params });

    expect(res.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith('add_template_plate', expect.objectContaining({ p_template_id: TEMPLATE_ID, p_plate_name: 'Extras', p_screenshot_path: null }));
  });

  it('returns 400 for a missing plate name', async () => {
    const res = await POST(request({}), { params });
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns 409 when the template does not exist', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Template not found' } });
    const res = await POST(request({ plateName: 'Extras' }), { params });
    expect(res.status).toBe(409);
  });
});
