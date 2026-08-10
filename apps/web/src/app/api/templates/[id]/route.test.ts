import type { AppUser } from '@print-queue/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN: AppUser = { id: 'admin-1', email: 'a@example.com', displayName: 'Admin', role: 'admin', active: true };
const TEMPLATE_ID = 'template-1';

vi.mock('@/lib/server/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/auth')>();
  return { ...actual, requireRole: vi.fn() };
});

const from = vi.fn();
const storageRemove = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from, storage: { from: () => ({ remove: storageRemove }) } }),
}));

const getJobTemplateWithPlates = vi.fn();
vi.mock('@/lib/server/data', () => ({
  getJobTemplateWithPlates: (...args: unknown[]) => getJobTemplateWithPlates(...args),
}));

import { requireRole, UnauthorizedError } from '@/lib/server/auth';
import { DELETE, GET, PATCH } from './route';

const params = Promise.resolve({ id: TEMPLATE_ID });

function patch(body: unknown) {
  return new Request(`http://localhost/api/templates/${TEMPLATE_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function fakeSelectResult(data: unknown, error: unknown = null) {
  const builder = { select: () => builder, eq: () => builder, single: () => Promise.resolve({ data, error }) };
  return builder;
}

function fakeSelectThenDelete(selectData: unknown, deleteError: unknown = null) {
  const selectBuilder = { select: () => selectBuilder, eq: () => selectBuilder, single: () => Promise.resolve({ data: selectData, error: null }) };
  const deleteBuilder = { delete: () => deleteBuilder, eq: () => Promise.resolve({ error: deleteError }) };
  return { selectBuilder, deleteBuilder };
}

beforeEach(() => {
  from.mockReset();
  storageRemove.mockReset();
  getJobTemplateWithPlates.mockReset();
  vi.mocked(requireRole).mockReset();
  vi.mocked(requireRole).mockResolvedValue(ADMIN);
});

describe('GET /api/templates/[id]', () => {
  it('returns 404 when the template does not exist', async () => {
    getJobTemplateWithPlates.mockResolvedValue(null);
    const res = await GET(new Request('http://localhost'), { params });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/templates/[id]', () => {
  it('returns 401 when the caller is not authenticated', async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());
    const res = await PATCH(patch({ archived: true }), { params });
    expect(res.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it('archiving sets archived_at, restoring clears it — never touches jobs (single-table update only)', async () => {
    let capturedArchive: Record<string, unknown> | null = null;
    from.mockImplementation(() => ({
      update: (patchBody: Record<string, unknown>) => {
        capturedArchive = patchBody;
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }));

    await PATCH(patch({ archived: true }), { params });
    expect(capturedArchive).toMatchObject({ archived_at: expect.any(String) });

    await PATCH(patch({ archived: false }), { params });
    expect(capturedArchive).toEqual({ archived_at: null });
  });

  it('edits only the fields provided', async () => {
    let capturedPatch: Record<string, unknown> | null = null;
    from.mockImplementation(() => ({
      update: (patchBody: Record<string, unknown>) => {
        capturedPatch = patchBody;
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }));

    await PATCH(patch({ name: 'New Name' }), { params });
    expect(capturedPatch).toEqual({ name: 'New Name' });
  });
});

describe('DELETE /api/templates/[id]', () => {
  it('returns 404 when the template does not exist', async () => {
    from.mockReturnValueOnce(fakeSelectResult(null, { message: 'not found' }));
    const res = await DELETE(new Request('http://localhost'), { params });
    expect(res.status).toBe(404);
  });

  it('deletes the template row then removes every plate screenshot unconditionally — safe because template plates never share a storage object', async () => {
    const { selectBuilder, deleteBuilder } = fakeSelectThenDelete({
      id: TEMPLATE_ID,
      plates: [{ screenshot_path: 'templates/t1/a.png' }, { screenshot_path: null }, { screenshot_path: 'templates/t1/b.png' }],
    });
    from.mockReturnValueOnce(selectBuilder).mockReturnValueOnce(deleteBuilder);

    const res = await DELETE(new Request('http://localhost'), { params });

    expect(res.status).toBe(200);
    expect(storageRemove).toHaveBeenCalledWith(['templates/t1/a.png', 'templates/t1/b.png']);
  });
});
