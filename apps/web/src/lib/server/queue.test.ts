import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  JobNotEligibleForRequeueError,
  JobNotFoundError,
  PrintFileUnavailableError,
  requeueJobFromHistory,
} from './queue';
import type { Database } from '../supabase/database.types';

const SOURCE_ID = 'job-source';
const USER_ID = 'user-1';

function seedSourceRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: SOURCE_ID,
    status: 'completed',
    storage_path: 'printer-1/job-source/plate.gcode.3mf',
    ...overrides,
  };
}

function seedNewJobRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'job-new',
    printer_id: 'printer-1',
    name: 'Vase',
    original_filename: 'vase.gcode.3mf',
    storage_path: 'printer-1/job-source/plate.gcode.3mf',
    file_size_bytes: 100,
    queue_position: 1,
    status: 'queued',
    estimated_duration_seconds: null,
    notes: null,
    created_by: USER_ID,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    started_at: null,
    completed_at: null,
    failure_message: null,
    ...overrides,
  };
}

/** Minimal fake covering only what requeueJobFromHistory reads directly — everything else is injected. */
function fakeAdminWithSourceJob(row: Record<string, unknown> | null) {
  return {
    from(table: string) {
      if (table !== 'print_jobs') throw new Error(`unexpected table ${table}`);
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  return { data: row, error: null };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient<Database>;
}

describe('requeueJobFromHistory', () => {
  it('creates a new queued job via the shared requeue RPC when the file exists', async () => {
    const admin = fakeAdminWithSourceJob(seedSourceRow());
    const checkFileExists = vi.fn().mockResolvedValue(true);
    const requeueRpc = vi.fn().mockResolvedValue({ data: seedNewJobRow(), error: null });

    const result = await requeueJobFromHistory(admin, SOURCE_ID, USER_ID, { checkFileExists, requeueRpc });

    expect(result.originalJobId).toBe(SOURCE_ID);
    expect(result.newJob).toMatchObject({ id: 'job-new', status: 'queued', queuePosition: 1 });
    expect(checkFileExists).toHaveBeenCalledWith(admin, 'printer-1/job-source/plate.gcode.3mf');
    expect(requeueRpc).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ p_source_job_id: SOURCE_ID, p_created_by: USER_ID }),
    );
    // A fresh id is minted client-side rather than reusing the source job's id.
    const [, args] = requeueRpc.mock.calls[0] as [unknown, { p_new_id: string }];
    expect(args.p_new_id).not.toBe(SOURCE_ID);
  });

  it('throws JobNotFoundError when the source job does not exist', async () => {
    const admin = fakeAdminWithSourceJob(null);

    await expect(
      requeueJobFromHistory(admin, SOURCE_ID, USER_ID, { checkFileExists: vi.fn(), requeueRpc: vi.fn() }),
    ).rejects.toThrow(JobNotFoundError);
  });

  it('throws JobNotEligibleForRequeueError for a job still active in the queue', async () => {
    const admin = fakeAdminWithSourceJob(seedSourceRow({ status: 'printing' }));

    await expect(
      requeueJobFromHistory(admin, SOURCE_ID, USER_ID, { checkFileExists: vi.fn(), requeueRpc: vi.fn() }),
    ).rejects.toThrow(JobNotEligibleForRequeueError);
  });

  it.each(['failed', 'skipped', 'cancelled'] as const)(
    'accepts a %s job, not just completed',
    async (status) => {
      const admin = fakeAdminWithSourceJob(seedSourceRow({ status }));
      const checkFileExists = vi.fn().mockResolvedValue(true);
      const requeueRpc = vi.fn().mockResolvedValue({ data: seedNewJobRow(), error: null });

      await expect(
        requeueJobFromHistory(admin, SOURCE_ID, USER_ID, { checkFileExists, requeueRpc }),
      ).resolves.toBeDefined();
    },
  );

  it('throws PrintFileUnavailableError and never calls the RPC when the file is missing', async () => {
    const admin = fakeAdminWithSourceJob(seedSourceRow());
    const checkFileExists = vi.fn().mockResolvedValue(false);
    const requeueRpc = vi.fn();

    await expect(
      requeueJobFromHistory(admin, SOURCE_ID, USER_ID, { checkFileExists, requeueRpc }),
    ).rejects.toThrow(PrintFileUnavailableError);
    expect(requeueRpc).not.toHaveBeenCalled();
  });

  it('propagates a database error from the RPC instead of swallowing it', async () => {
    const admin = fakeAdminWithSourceJob(seedSourceRow());
    const checkFileExists = vi.fn().mockResolvedValue(true);
    const requeueRpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'constraint violation' } });

    await expect(
      requeueJobFromHistory(admin, SOURCE_ID, USER_ID, { checkFileExists, requeueRpc }),
    ).rejects.toThrow(/constraint violation/);
  });
});
