import type { BridgeSupabaseClient } from '../lib/supabase.js';

/**
 * Minimal in-memory stand-in for the subset of supabase-js chains the bridge
 * actually uses (`select().eq().single()`, `update().eq()`, `insert()`,
 * `storage.from().download()`). Real rows live in `tables` so assertions can
 * check what actually got persisted, rather than just that a method was
 * called — see jobStatus.test.ts for the simpler single-chain version this
 * generalizes.
 */
export interface FakeTables {
  print_jobs: Record<string, unknown>[];
  printer_commands: Record<string, unknown>[];
  printers: Record<string, unknown>[];
  printer_events: Record<string, unknown>[];
}

export function createFakeSupabase(seed: Partial<FakeTables> = {}) {
  const tables: FakeTables = {
    print_jobs: (seed.print_jobs ?? []).map((row) => ({ ...row })),
    printer_commands: (seed.printer_commands ?? []).map((row) => ({ ...row })),
    printers: (seed.printers ?? []).map((row) => ({ ...row })),
    printer_events: (seed.printer_events ?? []).map((row) => ({ ...row })),
  };
  const storageFiles = new Map<string, Buffer>();

  function from(table: keyof FakeTables) {
    return {
      select: (_columns?: string) => ({
        eq: (column: string, value: unknown) => ({
          single: async () => {
            const row = tables[table].find((r) => r[column] === value);
            return row
              ? { data: row, error: null }
              : { data: null, error: { message: `${String(table)} row not found for ${column}=${String(value)}` } };
          },
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: async (column: string, value: unknown) => {
          let matched = false;
          tables[table] = tables[table].map((row) => {
            if (row[column] !== value) return row;
            matched = true;
            return { ...row, ...patch };
          });
          return matched
            ? { error: null }
            : { error: { message: `${String(table)} row not found for ${column}=${String(value)}` } };
        },
      }),
      insert: async (row: Record<string, unknown>) => {
        tables[table].push({ ...row });
        return { error: null };
      },
    };
  }

  return {
    client: {
      from,
      storage: {
        from: (_bucket: string) => ({
          download: async (path: string) => {
            const content = storageFiles.get(path);
            return content ? { data: new Blob([content]), error: null } : { data: null, error: { message: 'not found' } };
          },
        }),
      },
    } as unknown as BridgeSupabaseClient,
    tables,
    setStorageFile: (path: string, content: string) => storageFiles.set(path, Buffer.from(content)),
  };
}
