import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  JobNotEligibleForRequeueError,
  JobNotFoundError,
  ScreenshotUnavailableError,
  requeueBoardJobFromHistory,
} from './queue';
import type { Database } from '../supabase/database.types';

const SOURCE_ID = 'job-source';
const USER_ID = 'user-1';

function seedSourceRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: SOURCE_ID,
    board_status: 'completed',
    screenshot_path: 'job-source/plate.png',
    ...overrides,
  };
}

function seedNewJobRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'job-new',
    name: 'Vase',
    business: '3d_sports_displays',
    screenshot_path: 'job-new/plate.png',
    colors: null,
    queue_position: 1,
    board_status: 'queued',
    estimated_duration_seconds: null,
    notes: null,
    parent_job_id: null,
    created_by: USER_ID,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    completed_at: null,
    ...overrides,
  };
}

/** Minimal fake covering only what requeueBoardJobFromHistory reads directly (print_jobs) — everything else is injected. */
function fakeAdmin(printJob: Record<string, unknown> | null) {
  return {
    from(table: string) {
      if (table === 'print_jobs') {
        return {
          select: () => ({
            eq: () => ({
              async maybeSingle() {
                return { data: printJob, error: null };
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient<Database>;
}

describe('requeueBoardJobFromHistory', () => {
  it('creates a new queued job via the shared requeue RPC when the screenshot exists', async () => {
    const admin = fakeAdmin(seedSourceRow());
    const checkScreenshotExists = vi.fn().mockResolvedValue(true);
    const requeueRpc = vi.fn().mockResolvedValue({ data: seedNewJobRow(), error: null });

    const result = await requeueBoardJobFromHistory(admin, SOURCE_ID, USER_ID, {
      checkScreenshotExists,
      requeueRpc,
    });

    expect(result.originalJobId).toBe(SOURCE_ID);
    expect(result.newJob).toMatchObject({ id: 'job-new', status: 'queued', queuePosition: 1 });
    expect(checkScreenshotExists).toHaveBeenCalledWith(admin, 'job-source/plate.png');
    expect(requeueRpc).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ p_source_job_id: SOURCE_ID, p_created_by: USER_ID }),
    );
    // A fresh id is minted client-side rather than reusing the source job's id.
    const [, args] = requeueRpc.mock.calls[0] as [unknown, { p_new_id: string }];
    expect(args.p_new_id).not.toBe(SOURCE_ID);
  });

  it('throws JobNotFoundError when the source job does not exist', async () => {
    const admin = fakeAdmin(null);

    await expect(
      requeueBoardJobFromHistory(admin, SOURCE_ID, USER_ID, {
        checkScreenshotExists: vi.fn(),
        requeueRpc: vi.fn(),
      }),
    ).rejects.toThrow(JobNotFoundError);
  });

  it('throws JobNotEligibleForRequeueError for a job still active on the board', async () => {
    const admin = fakeAdmin(seedSourceRow({ board_status: 'printing' }));

    await expect(
      requeueBoardJobFromHistory(admin, SOURCE_ID, USER_ID, {
        checkScreenshotExists: vi.fn(),
        requeueRpc: vi.fn(),
      }),
    ).rejects.toThrow(JobNotEligibleForRequeueError);
  });

  it('accepts a partial job, not just completed', async () => {
    const admin = fakeAdmin(seedSourceRow({ board_status: 'partial' }));
    const checkScreenshotExists = vi.fn().mockResolvedValue(true);
    const requeueRpc = vi.fn().mockResolvedValue({ data: seedNewJobRow(), error: null });

    await expect(
      requeueBoardJobFromHistory(admin, SOURCE_ID, USER_ID, { checkScreenshotExists, requeueRpc }),
    ).resolves.toBeDefined();
  });

  it('throws ScreenshotUnavailableError and never calls the RPC when the screenshot is missing on disk', async () => {
    const admin = fakeAdmin(seedSourceRow());
    const checkScreenshotExists = vi.fn().mockResolvedValue(false);
    const requeueRpc = vi.fn();

    await expect(
      requeueBoardJobFromHistory(admin, SOURCE_ID, USER_ID, { checkScreenshotExists, requeueRpc }),
    ).rejects.toThrow(ScreenshotUnavailableError);
    expect(requeueRpc).not.toHaveBeenCalled();
  });

  it('throws ScreenshotUnavailableError when the source job has no screenshot_path', async () => {
    const admin = fakeAdmin(seedSourceRow({ screenshot_path: null }));
    const checkScreenshotExists = vi.fn().mockResolvedValue(true);
    const requeueRpc = vi.fn();

    await expect(
      requeueBoardJobFromHistory(admin, SOURCE_ID, USER_ID, { checkScreenshotExists, requeueRpc }),
    ).rejects.toThrow(ScreenshotUnavailableError);
    expect(checkScreenshotExists).not.toHaveBeenCalled();
    expect(requeueRpc).not.toHaveBeenCalled();
  });

  it('propagates a database error from the RPC instead of swallowing it', async () => {
    const admin = fakeAdmin(seedSourceRow());
    const checkScreenshotExists = vi.fn().mockResolvedValue(true);
    const requeueRpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'constraint violation' } });

    await expect(
      requeueBoardJobFromHistory(admin, SOURCE_ID, USER_ID, { checkScreenshotExists, requeueRpc }),
    ).rejects.toThrow(/constraint violation/);
  });
});
