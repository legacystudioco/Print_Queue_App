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

const getJobTemplates = vi.fn();
vi.mock('@/lib/server/data', () => ({
  getJobTemplates: (...args: unknown[]) => getJobTemplates(...args),
}));

import { requireRole, UnauthorizedError } from '@/lib/server/auth';
import { GET, POST } from './route';

function get(query: string) {
  return new Request(`http://localhost/api/templates${query}`);
}

function post(body: unknown) {
  return new Request('http://localhost/api/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  rpc.mockReset();
  getJobTemplates.mockReset();
  getJobTemplates.mockResolvedValue([]);
  vi.mocked(requireRole).mockReset();
  vi.mocked(requireRole).mockResolvedValue(ADMIN);
});

describe('GET /api/templates', () => {
  it('returns 401 when the caller is not authenticated', async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());
    const res = await GET(get(''));
    expect(res.status).toBe(401);
    expect(getJobTemplates).not.toHaveBeenCalled();
  });

  it('passes q/includeArchived through, defaulting includeArchived to false', async () => {
    await GET(get('?q=Football&includeArchived=true'));
    expect(getJobTemplates).toHaveBeenCalledWith(expect.anything(), { q: 'Football', includeArchived: true });

    await GET(get(''));
    expect(getJobTemplates).toHaveBeenLastCalledWith(expect.anything(), { q: undefined, includeArchived: false });
  });
});

describe('POST /api/templates', () => {
  it('returns 401 when the caller is not authenticated', async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());
    const res = await POST(post({ templateId: crypto.randomUUID(), name: 'Football', defaultBusiness: '3d_sports_displays', plates: [] }));
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('allows an empty plate list — a template can be built up plate by plate afterward', async () => {
    rpc.mockResolvedValue({ data: { id: 'template-1', name: 'Football' }, error: null });

    const res = await POST(post({ templateId: crypto.randomUUID(), name: 'Football', defaultBusiness: '3d_sports_displays', plates: [] }));

    expect(res.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith('create_job_template', expect.objectContaining({ p_plates: [] }));
  });

  it('returns 400 for a payload missing a name', async () => {
    const res = await POST(post({ templateId: crypto.randomUUID(), defaultBusiness: '3d_sports_displays', plates: [] }));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('passes every plate field through to create_job_template, preserving order', async () => {
    rpc.mockResolvedValue({ data: { id: 'template-1' }, error: null });
    const plates = [
      { id: crypto.randomUUID(), plateName: 'Name Plate', screenshotPath: 'templates/t1/a.png', colors: 'Black/White', estimatedDurationSeconds: 4800, notes: null },
      { id: crypto.randomUUID(), plateName: 'Base', screenshotPath: null, colors: 'Black', estimatedDurationSeconds: 9000, notes: 'Heavy infill' },
    ];

    await POST(post({ templateId: crypto.randomUUID(), name: 'Football Display', defaultBusiness: '3d_sports_displays', plates }));

    const [, args] = rpc.mock.calls[0] as [string, { p_plates: typeof plates }];
    expect(args.p_plates.map((p) => p.plateName)).toEqual(['Name Plate', 'Base']);
    expect(args.p_plates[0]!.screenshotPath).toBe('templates/t1/a.png');
    expect(args.p_plates[1]!.notes).toBe('Heavy infill');
  });
});
