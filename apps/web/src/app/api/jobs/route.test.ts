import type { AppUser } from '@print-queue/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN: AppUser = { id: 'admin-1', email: 'a@example.com', displayName: 'Admin', role: 'admin', active: true };

vi.mock('@/lib/server/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/auth')>();
  return { ...actual, requireRole: vi.fn() };
});

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({}),
}));

const searchJobs = vi.fn();
vi.mock('@/lib/server/data', () => ({
  searchJobs: (...args: unknown[]) => searchJobs(...args),
}));

import { requireRole, UnauthorizedError } from '@/lib/server/auth';
import { GET } from './route';

function get(query: string) {
  return new Request(`http://localhost/api/jobs${query}`);
}

beforeEach(() => {
  searchJobs.mockReset();
  searchJobs.mockResolvedValue([]);
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
