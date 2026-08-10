import type { AppUser } from '@print-queue/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN: AppUser = { id: 'admin-1', email: 'a@example.com', displayName: 'Admin', role: 'admin', active: true };
const JOB_ID = 'job-1';

vi.mock('@/lib/server/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/auth')>();
  return { ...actual, requireRole: vi.fn() };
});

const from = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from }),
}));

import { requireRole, UnauthorizedError } from '@/lib/server/auth';
import { PATCH } from './route';

function patch(body: unknown) {
  return new Request(`http://localhost/api/jobs/${JOB_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: JOB_ID });

function stubUpdate(capture: (patchBody: Record<string, unknown>) => void) {
  from.mockImplementation(() => ({
    update: (patchBody: Record<string, unknown>) => {
      capture(patchBody);
      return { eq: () => Promise.resolve({ error: null }) };
    },
  }));
}

beforeEach(() => {
  from.mockReset();
  vi.mocked(requireRole).mockReset();
  vi.mocked(requireRole).mockResolvedValue(ADMIN);
});

describe('PATCH /api/jobs/[id] — shipByDate', () => {
  it('returns 401 when the caller is not authenticated', async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());
    const res = await PATCH(patch({ shipByDate: '2026-08-14' }), { params });
    expect(res.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it('adds a Ship By date to a job that has none — only ship_by_date is written', async () => {
    let captured: Record<string, unknown> | null = null;
    stubUpdate((body) => (captured = body));

    const res = await PATCH(patch({ shipByDate: '2026-08-14' }), { params });

    expect(res.status).toBe(200);
    expect(captured).toEqual({ ship_by_date: '2026-08-14' });
  });

  it('changes an existing Ship By date', async () => {
    let captured: Record<string, unknown> | null = null;
    stubUpdate((body) => (captured = body));

    await PATCH(patch({ shipByDate: '2026-09-01' }), { params });

    expect(captured).toEqual({ ship_by_date: '2026-09-01' });
  });

  it('clears an existing Ship By date via explicit null', async () => {
    let captured: Record<string, unknown> | null = null;
    stubUpdate((body) => (captured = body));

    await PATCH(patch({ shipByDate: null }), { params });

    expect(captured).toEqual({ ship_by_date: null });
  });

  it('omitting shipByDate leaves it untouched — editing notes never writes ship_by_date', async () => {
    let captured: Record<string, unknown> | null = null;
    stubUpdate((body) => (captured = body));

    await PATCH(patch({ notes: 'Updated notes' }), { params });

    expect(captured).toEqual({ notes: 'Updated notes' });
    expect(captured).not.toHaveProperty('ship_by_date');
  });

  it('rejects a malformed date', async () => {
    const res = await PATCH(patch({ shipByDate: 'not-a-date' }), { params });
    expect(res.status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });
});
