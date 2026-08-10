import type { AppUser } from '@print-queue/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN: AppUser = { id: 'admin-1', email: 'a@example.com', displayName: 'Admin', role: 'admin', active: true };
const TEMPLATE_ID = 'template-1';
const PLATE_A = crypto.randomUUID();
const PLATE_B = crypto.randomUUID();

vi.mock('@/lib/server/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/auth')>();
  return { ...actual, requireRole: vi.fn() };
});

const rpc = vi.fn();
const storageCopy = vi.fn();
const storageRemove = vi.fn();
const from = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    rpc,
    from,
    storage: { from: () => ({ copy: storageCopy, remove: storageRemove }) },
  }),
}));

import { requireRole, UnauthorizedError } from '@/lib/server/auth';
import { POST } from './route';

/** A thenable + chainable fake matching just enough of the PostgREST query builder for this route's one `.select().eq().in()` read. */
function fakeSelectResult(data: unknown, error: unknown = null) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    then: (resolve: (v: { data: unknown; error: unknown }) => void) => resolve({ data, error }),
  };
  return builder;
}

function request(body: unknown) {
  return new Request(`http://localhost/api/templates/${TEMPLATE_ID}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: TEMPLATE_ID });

function templatePlate(id: string, screenshotPath: string | null) {
  return { id, screenshot_path: screenshotPath };
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    jobId: crypto.randomUUID(),
    customerName: 'Riley',
    business: '3d_sports_displays',
    notes: null,
    plates: [
      { templatePlateId: PLATE_A, plateName: 'Name Plate', colors: 'Black/White', estimatedDurationSeconds: 4800, notes: null },
      { templatePlateId: PLATE_B, plateName: 'Base', colors: 'Black', estimatedDurationSeconds: 9000, notes: null },
    ],
    ...overrides,
  };
}

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

describe('POST /api/templates/[id]/jobs', () => {
  it('returns 401 when the caller is not authenticated', async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());
    const res = await POST(request(validPayload()), { params });
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid payload (no plates)', async () => {
    const res = await POST(request(validPayload({ plates: [] })), { params });
    expect(res.status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it('copies each template plate screenshot to a fresh job-scoped path and creates the job with the copies — never the original template paths', async () => {
    from.mockReturnValueOnce(
      fakeSelectResult([templatePlate(PLATE_A, 'templates/t1/aaa-name.png'), templatePlate(PLATE_B, 'templates/t1/bbb-base.png')]),
    );
    storageCopy.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({ data: { id: 'job-1', customer_name: 'Riley' }, error: null });

    const payload = validPayload();
    const res = await POST(request(payload), { params });

    expect(res.status).toBe(201);
    expect(storageCopy).toHaveBeenCalledTimes(2);
    // Neither copy call's destination is the original template path — every job plate gets an independent object.
    for (const call of storageCopy.mock.calls) {
      expect(call[0]).toMatch(/^templates\/t1\//);
      expect(call[1]).not.toBe(call[0]);
      expect(call[1]).not.toMatch(/^templates\//);
    }

    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0] as [string, { p_plates: { screenshotPath: string }[] }];
    expect(fn).toBe('create_job_with_plates');
    expect(args.p_plates).toHaveLength(2);
    // The created job's plates reference the copies, not the template's own screenshot_path.
    expect(args.p_plates.map((p) => p.screenshotPath)).not.toContain('templates/t1/aaa-name.png');
    expect(args.p_plates.map((p) => p.screenshotPath)).not.toContain('templates/t1/bbb-base.png');
  });

  it('uses the client-supplied replacement screenshot as-is, without copying the template plate', async () => {
    from.mockReturnValueOnce(fakeSelectResult([templatePlate(PLATE_A, 'templates/t1/aaa-name.png'), templatePlate(PLATE_B, 'templates/t1/bbb-base.png')]));
    rpc.mockResolvedValue({ data: { id: 'job-1' }, error: null });

    const payload = validPayload({
      plates: [
        { templatePlateId: PLATE_A, plateName: 'Name Plate', colors: null, estimatedDurationSeconds: null, notes: null, screenshotPath: 'job-1/replacement.png' },
        { templatePlateId: PLATE_B, plateName: 'Base', colors: null, estimatedDurationSeconds: null, notes: null },
      ],
    });
    await POST(request(payload), { params });

    // Only plate-b (no client-supplied path) triggers a server-side copy.
    expect(storageCopy).toHaveBeenCalledTimes(1);
    const [, args] = rpc.mock.calls[0] as [string, { p_plates: { screenshotPath: string }[] }];
    expect(args.p_plates.map((p) => p.screenshotPath)).toContain('job-1/replacement.png');
  });

  it('rolls back (deletes) copied screenshots when create_job_with_plates fails, and reports the RPC error', async () => {
    from.mockReturnValueOnce(fakeSelectResult([templatePlate(PLATE_A, 'templates/t1/aaa-name.png'), templatePlate(PLATE_B, 'templates/t1/bbb-base.png')]));
    storageCopy.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const res = await POST(request(validPayload()), { params });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('boom');
    expect(storageRemove).toHaveBeenCalledTimes(1);
    const removedPaths = storageRemove.mock.calls[0]![0] as string[];
    expect(removedPaths).toHaveLength(2);
  });

  it('returns 409 if a submitted plate no longer belongs to this template', async () => {
    from.mockReturnValueOnce(fakeSelectResult([templatePlate(PLATE_A, null)]));

    const res = await POST(request(validPayload()), { params });

    expect(res.status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });
});
