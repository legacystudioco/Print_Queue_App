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

const searchJobs = vi.fn();
vi.mock('@/lib/server/data', () => ({
  searchJobs: (...args: unknown[]) => searchJobs(...args),
}));

import { requireRole, UnauthorizedError } from '@/lib/server/auth';
import { GET, POST } from './route';

function get(query: string) {
  return new Request(`http://localhost/api/jobs${query}`);
}

function post(body: unknown) {
  return new Request('http://localhost/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function validCreatePayload(overrides: Record<string, unknown> = {}) {
  return {
    jobId: crypto.randomUUID(),
    customerName: 'John Smith',
    business: '3d_sports_displays',
    notes: null,
    plates: [
      {
        id: crypto.randomUUID(),
        plateName: 'Base',
        screenshotPath: 'job-1/base.png',
        colors: null,
        estimatedDurationSeconds: null,
        notes: null,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  searchJobs.mockReset();
  searchJobs.mockResolvedValue([]);
  rpc.mockReset();
  vi.mocked(requireRole).mockReset();
  vi.mocked(requireRole).mockResolvedValue(ADMIN);
});

describe('GET /api/jobs', () => {
  it('returns 401 when the caller is not authenticated', async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());
    const res = await GET(get(''));
    expect(res.status).toBe(401);
    expect(searchJobs).not.toHaveBeenCalled();
  });

  it('passes q/business/status/standaloneOnly/excludeId through to searchJobs', async () => {
    const res = await GET(
      get('?q=Hug&business=3d_sports_displays&status=queued&standaloneOnly=true&excludeId=job-1'),
    );

    expect(res.status).toBe(200);
    expect(searchJobs).toHaveBeenCalledWith(expect.anything(), {
      q: 'Hug',
      business: '3d_sports_displays',
      status: 'queued',
      standaloneOnly: true,
      excludeJobId: 'job-1',
    });
  });

  it('defaults standaloneOnly to false and omits unset filters', async () => {
    await GET(get(''));

    expect(searchJobs).toHaveBeenCalledWith(expect.anything(), {
      q: undefined,
      business: undefined,
      status: undefined,
      standaloneOnly: false,
      excludeJobId: undefined,
    });
  });

  it('returns 400 for an invalid business filter', async () => {
    const res = await GET(get('?business=not-a-business'));
    expect(res.status).toBe(400);
    expect(searchJobs).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid status filter', async () => {
    const res = await GET(get('?status=not-a-status'));
    expect(res.status).toBe(400);
    expect(searchJobs).not.toHaveBeenCalled();
  });

  it('returns the jobs from searchJobs on success', async () => {
    searchJobs.mockResolvedValue([{ id: 'job-1' }]);
    const res = await GET(get(''));
    const body = await res.json();
    expect(body.jobs).toEqual([{ id: 'job-1' }]);
  });
});

describe('POST /api/jobs — shipByDate', () => {
  it('creates a job without a Ship By date — passes null through to create_job_with_plates', async () => {
    rpc.mockResolvedValue({ data: { id: 'job-1' }, error: null });

    const res = await POST(post(validCreatePayload()));

    expect(res.status).toBe(201);
    const [fn, args] = rpc.mock.calls[0] as [string, { p_ship_by_date: string | null }];
    expect(fn).toBe('create_job_with_plates');
    expect(args.p_ship_by_date).toBeNull();
  });

  it('creates a job with a Ship By date — passes it through to create_job_with_plates', async () => {
    rpc.mockResolvedValue({ data: { id: 'job-1' }, error: null });

    await POST(post(validCreatePayload({ shipByDate: '2026-08-14' })));

    const [, args] = rpc.mock.calls[0] as [string, { p_ship_by_date: string | null }];
    expect(args.p_ship_by_date).toBe('2026-08-14');
  });
});
