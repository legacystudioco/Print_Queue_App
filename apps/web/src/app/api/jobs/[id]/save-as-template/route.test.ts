import type { AppUser } from '@print-queue/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN: AppUser = { id: 'admin-1', email: 'a@example.com', displayName: 'Admin', role: 'admin', active: true };
const JOB_ID = 'job-1';
const PLATE_A = crypto.randomUUID();
const PLATE_B = crypto.randomUUID();
const PLATE_C = crypto.randomUUID();
const NEW_TEMPLATE_ID = crypto.randomUUID();

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

function fakeSingleResult(data: unknown, error: unknown = null) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    single: () => Promise.resolve({ data, error }),
  };
  return builder;
}

function request(body: unknown) {
  return new Request(`http://localhost/api/jobs/${JOB_ID}/save-as-template`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: JOB_ID });

function jobPlate(id: string, name: string, sortOrder: number, screenshotPath: string | null = null) {
  return {
    id,
    plate_name: name,
    screenshot_path: screenshotPath,
    colors: 'Black',
    estimated_duration_seconds: 3600,
    notes: null,
    sort_order: sortOrder,
  };
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    templateId: crypto.randomUUID(),
    name: 'Football Display',
    description: null,
    defaultBusiness: '3d_sports_displays',
    plateIds: [PLATE_B, PLATE_A],
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

describe('POST /api/jobs/[id]/save-as-template', () => {
  it('returns 401 when the caller is not authenticated', async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());
    const res = await POST(request(validPayload()), { params });
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns 400 when no plates are selected', async () => {
    const res = await POST(request(validPayload({ plateIds: [] })), { params });
    expect(res.status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it('omits deselected plates and preserves the job’s relative plate order regardless of plateIds order', async () => {
    from.mockReturnValueOnce(
      fakeSingleResult({
        id: JOB_ID,
        plates: [
          jobPlate(PLATE_A, 'Name Plate', 1, 'job-1/aaa.png'),
          jobPlate(PLATE_B, 'Base', 2, 'job-1/bbb.png'),
          jobPlate(PLATE_C, 'Extras', 3, null),
        ],
      }),
    );
    storageCopy.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({ data: { id: 'template-1' }, error: null });

    // plateIds intentionally out of job order — kept plates must still be sent in the job's own sort_order.
    const res = await POST(request(validPayload({ plateIds: [PLATE_B, PLATE_A] })), { params });

    expect(res.status).toBe(201);
    const [fn, args] = rpc.mock.calls[0] as [string, { p_plates: { plateName: string }[] }];
    expect(fn).toBe('create_job_template');
    expect(args.p_plates.map((p) => p.plateName)).toEqual(['Name Plate', 'Base']);
    expect(args.p_plates).toHaveLength(2);
  });

  it('copies each kept plate’s screenshot to a fresh templates/{id}/... object — never the job’s own path', async () => {
    from.mockReturnValueOnce(fakeSingleResult({ id: JOB_ID, plates: [jobPlate(PLATE_A, 'Name Plate', 1, 'job-1/aaa.png')] }));
    storageCopy.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({ data: { id: 'template-1' }, error: null });

    const payload = validPayload({ templateId: NEW_TEMPLATE_ID, plateIds: [PLATE_A] });
    await POST(request(payload), { params });

    expect(storageCopy).toHaveBeenCalledTimes(1);
    const [fromPath, toPath] = storageCopy.mock.calls[0] as [string, string];
    expect(fromPath).toBe('job-1/aaa.png');
    expect(toPath).toMatch(new RegExp(`^templates/${NEW_TEMPLATE_ID}/`));
    expect(toPath).not.toBe(fromPath);
  });

  it('rolls back copied screenshots when create_job_template fails', async () => {
    from.mockReturnValueOnce(fakeSingleResult({ id: JOB_ID, plates: [jobPlate(PLATE_A, 'Name Plate', 1, 'job-1/aaa.png')] }));
    storageCopy.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const res = await POST(request(validPayload({ plateIds: [PLATE_A] })), { params });

    expect(res.status).toBe(500);
    expect(storageRemove).toHaveBeenCalledTimes(1);
  });
});
