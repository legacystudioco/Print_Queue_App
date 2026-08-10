import type { AppUser } from '@print-queue/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN: AppUser = { id: 'admin-1', email: 'a@example.com', displayName: 'Admin', role: 'admin', active: true };
const TEMPLATE_ID = 'template-1';

vi.mock('@/lib/server/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/auth')>();
  return { ...actual, requireRole: vi.fn() };
});

const rpc = vi.fn();
const storageCopy = vi.fn();
const storageRemove = vi.fn();
const from = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ rpc, from, storage: { from: () => ({ copy: storageCopy, remove: storageRemove }) } }),
}));

import { requireRole, UnauthorizedError } from '@/lib/server/auth';
import { POST } from './route';

function fakeSelectResult(data: unknown, error: unknown = null) {
  const builder = { select: () => builder, eq: () => builder, single: () => Promise.resolve({ data, error }) };
  return builder;
}

function post(body: unknown = {}) {
  return new Request(`http://localhost/api/templates/${TEMPLATE_ID}/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newTemplateId: crypto.randomUUID(), ...(body as object) }),
  });
}

const params = Promise.resolve({ id: TEMPLATE_ID });

beforeEach(() => {
  rpc.mockReset();
  storageCopy.mockReset();
  storageCopy.mockResolvedValue({ error: null });
  storageRemove.mockReset();
  storageRemove.mockResolvedValue({ error: null });
  from.mockReset();
  vi.mocked(requireRole).mockReset();
  vi.mocked(requireRole).mockResolvedValue(ADMIN);
});

describe('POST /api/templates/[id]/duplicate', () => {
  it('returns 401 when the caller is not authenticated', async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());
    const res = await POST(post(), { params });
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('copies every plate screenshot to a fresh object and defaults the new name to "<source> Copy"', async () => {
    from.mockReturnValueOnce(
      fakeSelectResult({
        id: TEMPLATE_ID,
        name: 'Football Display',
        plates: [
          { id: 'p1', screenshot_path: 'templates/t1/a.png', sort_order: 1 },
          { id: 'p2', screenshot_path: null, sort_order: 2 },
        ],
      }),
    );
    storageCopy.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({ data: { id: 'template-2', name: 'Football Display Copy' }, error: null });

    const res = await POST(post(), { params });

    expect(res.status).toBe(201);
    expect(storageCopy).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0] as [string, { p_new_name: string; p_plates: { screenshotPath: string | null }[] }];
    expect(fn).toBe('duplicate_job_template');
    expect(args.p_new_name).toBe('Football Display Copy');
    expect(args.p_plates).toHaveLength(2);
    // The copy's plates never reference the source's screenshot object.
    expect(args.p_plates.map((p) => p.screenshotPath)).not.toContain('templates/t1/a.png');
  });

  it('honors an explicit name override instead of appending " Copy"', async () => {
    from.mockReturnValueOnce(fakeSelectResult({ id: TEMPLATE_ID, name: 'Football Display', plates: [] }));
    rpc.mockResolvedValue({ data: { id: 'template-2' }, error: null });

    await POST(post({ name: 'Basketball Display' }), { params });

    const [, args] = rpc.mock.calls[0] as [string, { p_new_name: string }];
    expect(args.p_new_name).toBe('Basketball Display');
  });

  it('rolls back copied screenshots when duplicate_job_template fails', async () => {
    from.mockReturnValueOnce(
      fakeSelectResult({ id: TEMPLATE_ID, name: 'Football Display', plates: [{ id: 'p1', screenshot_path: 'templates/t1/a.png', sort_order: 1 }] }),
    );
    storageCopy.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const res = await POST(post(), { params });

    expect(res.status).toBe(500);
    expect(storageRemove).toHaveBeenCalledTimes(1);
  });
});
