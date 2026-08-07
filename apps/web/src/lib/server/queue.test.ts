import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  PlateNotEligibleForRequeueError,
  PlateNotFoundError,
  ScreenshotUnavailableError,
  requeuePlateFromHistory,
} from './queue';
import type { Database } from '../supabase/database.types';

const SOURCE_ID = 'plate-source';

function seedSourceRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: SOURCE_ID,
    status: 'completed',
    screenshot_path: 'job-1/plate.png',
    ...overrides,
  };
}

function seedNewPlateRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'plate-new',
    job_id: 'job-1',
    plate_name: 'Base',
    screenshot_path: 'job-1/plate.png',
    colors: null,
    estimated_duration_seconds: null,
    notes: null,
    status: 'queued',
    parent_plate_id: null,
    sort_order: 2,
    created_at: '2026-01-01T00:00:00Z',
    completed_at: null,
    ...overrides,
  };
}

/** Minimal fake covering only what requeuePlateFromHistory reads directly (plates) — everything else is injected. */
function fakeAdmin(plate: Record<string, unknown> | null) {
  return {
    from(table: string) {
      if (table === 'plates') {
        return {
          select: () => ({
            eq: () => ({
              async maybeSingle() {
                return { data: plate, error: null };
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient<Database>;
}

describe('requeuePlateFromHistory', () => {
  it('creates a new queued plate via the shared duplicate_plate RPC when the screenshot exists', async () => {
    const admin = fakeAdmin(seedSourceRow());
    const checkScreenshotExists = vi.fn().mockResolvedValue(true);
    const duplicatePlateRpc = vi.fn().mockResolvedValue({ data: seedNewPlateRow(), error: null });

    const result = await requeuePlateFromHistory(admin, SOURCE_ID, {
      checkScreenshotExists,
      duplicatePlateRpc,
    });

    expect(result.originalPlateId).toBe(SOURCE_ID);
    expect(result.newPlate).toMatchObject({ id: 'plate-new', status: 'queued', sortOrder: 2 });
    expect(checkScreenshotExists).toHaveBeenCalledWith(admin, 'job-1/plate.png');
    expect(duplicatePlateRpc).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ p_source_plate_id: SOURCE_ID }),
    );
    // A fresh id is minted client-side rather than reusing the source plate's id.
    const [, args] = duplicatePlateRpc.mock.calls[0] as [unknown, { p_new_plate_id: string }];
    expect(args.p_new_plate_id).not.toBe(SOURCE_ID);
  });

  it('throws PlateNotFoundError when the source plate does not exist', async () => {
    const admin = fakeAdmin(null);

    await expect(
      requeuePlateFromHistory(admin, SOURCE_ID, {
        checkScreenshotExists: vi.fn(),
        duplicatePlateRpc: vi.fn(),
      }),
    ).rejects.toThrow(PlateNotFoundError);
  });

  it('throws PlateNotEligibleForRequeueError for a plate still active on the board', async () => {
    const admin = fakeAdmin(seedSourceRow({ status: 'printing' }));

    await expect(
      requeuePlateFromHistory(admin, SOURCE_ID, {
        checkScreenshotExists: vi.fn(),
        duplicatePlateRpc: vi.fn(),
      }),
    ).rejects.toThrow(PlateNotEligibleForRequeueError);
  });

  it('accepts a partial plate, not just completed', async () => {
    const admin = fakeAdmin(seedSourceRow({ status: 'partial' }));
    const checkScreenshotExists = vi.fn().mockResolvedValue(true);
    const duplicatePlateRpc = vi.fn().mockResolvedValue({ data: seedNewPlateRow(), error: null });

    await expect(
      requeuePlateFromHistory(admin, SOURCE_ID, { checkScreenshotExists, duplicatePlateRpc }),
    ).resolves.toBeDefined();
  });

  it('throws ScreenshotUnavailableError and never calls the RPC when the screenshot is missing on disk', async () => {
    const admin = fakeAdmin(seedSourceRow());
    const checkScreenshotExists = vi.fn().mockResolvedValue(false);
    const duplicatePlateRpc = vi.fn();

    await expect(
      requeuePlateFromHistory(admin, SOURCE_ID, { checkScreenshotExists, duplicatePlateRpc }),
    ).rejects.toThrow(ScreenshotUnavailableError);
    expect(duplicatePlateRpc).not.toHaveBeenCalled();
  });

  it('throws ScreenshotUnavailableError when the source plate has no screenshot_path', async () => {
    const admin = fakeAdmin(seedSourceRow({ screenshot_path: null }));
    const checkScreenshotExists = vi.fn().mockResolvedValue(true);
    const duplicatePlateRpc = vi.fn();

    await expect(
      requeuePlateFromHistory(admin, SOURCE_ID, { checkScreenshotExists, duplicatePlateRpc }),
    ).rejects.toThrow(ScreenshotUnavailableError);
    expect(checkScreenshotExists).not.toHaveBeenCalled();
    expect(duplicatePlateRpc).not.toHaveBeenCalled();
  });

  it('propagates a database error from the RPC instead of swallowing it', async () => {
    const admin = fakeAdmin(seedSourceRow());
    const checkScreenshotExists = vi.fn().mockResolvedValue(true);
    const duplicatePlateRpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'constraint violation' } });

    await expect(
      requeuePlateFromHistory(admin, SOURCE_ID, { checkScreenshotExists, duplicatePlateRpc }),
    ).rejects.toThrow(/constraint violation/);
  });
});
