import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { getPrintFileAvailability, printFileExists } from './storage';
import type { Database } from '../supabase/database.types';

function fakeAdminWithStorageEntries(entriesByDir: Record<string, { name: string }[]>) {
  const list = vi.fn(async (dir: string, opts: { search?: string }) => {
    const entries = entriesByDir[dir] ?? [];
    const matching = opts.search ? entries.filter((e) => e.name === opts.search) : entries;
    return { data: matching, error: null };
  });

  return {
    client: {
      storage: { from: () => ({ list }) },
    } as unknown as SupabaseClient<Database>,
    list,
  };
}

describe('printFileExists', () => {
  it('is true when the object is present at its storage path', async () => {
    const { client } = fakeAdminWithStorageEntries({
      'printer-1/job-1': [{ name: 'plate.gcode.3mf' }],
    });

    await expect(printFileExists(client, 'printer-1/job-1/plate.gcode.3mf')).resolves.toBe(true);
  });

  it('is false when the directory exists but the file does not (deleted)', async () => {
    const { client } = fakeAdminWithStorageEntries({
      'printer-1/job-1': [],
    });

    await expect(printFileExists(client, 'printer-1/job-1/plate.gcode.3mf')).resolves.toBe(false);
  });

  it('is false (not thrown) when the storage call itself errors', async () => {
    const client = {
      storage: { from: () => ({ list: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }) }) },
    } as unknown as SupabaseClient<Database>;

    await expect(printFileExists(client, 'printer-1/job-1/plate.gcode.3mf')).resolves.toBe(false);
  });
});

describe('getPrintFileAvailability', () => {
  it('checks each unique storage path once and returns a lookup map', async () => {
    const { client, list } = fakeAdminWithStorageEntries({
      'printer-1/job-1': [{ name: 'a.gcode.3mf' }],
      'printer-1/job-2': [],
    });

    const result = await getPrintFileAvailability(client, [
      'printer-1/job-1/a.gcode.3mf',
      'printer-1/job-2/b.gcode.3mf',
      'printer-1/job-1/a.gcode.3mf', // duplicate — should not trigger a second lookup
    ]);

    expect(result.get('printer-1/job-1/a.gcode.3mf')).toBe(true);
    expect(result.get('printer-1/job-2/b.gcode.3mf')).toBe(false);
    expect(list).toHaveBeenCalledTimes(2);
  });
});
