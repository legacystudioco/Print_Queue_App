import type { BridgeSupabaseClient } from '../lib/supabase.js';

/**
 * Minimal in-memory stand-in for the subset of supabase-js chains the bridge
 * actually uses (`select().eq().in().order().limit().single()/.maybeSingle()`,
 * `update().eq()`, `insert()` with or without a chained `.select().single()`,
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
  print_job_notifications: Record<string, unknown>[];
}

/** Tables whose unique constraints matter for the behavior under test — mirrors migration 0008. */
const UNIQUE_CONSTRAINTS: Partial<Record<keyof FakeTables, string[][]>> = {
  print_job_notifications: [['print_job_id', 'notification_type']],
};

let idCounter = 0;
function makeId(): string {
  idCounter += 1;
  return `fake-id-${idCounter}`;
}

interface FakeError {
  code?: string;
  message: string;
}

type Filter = { column: string; op: 'eq' | 'in'; value: unknown };

function applyFilters(rows: Record<string, unknown>[], filters: Filter[]): Record<string, unknown>[] {
  return rows.filter((row) =>
    filters.every((f) =>
      f.op === 'eq' ? row[f.column] === f.value : (f.value as unknown[]).includes(row[f.column]),
    ),
  );
}

export function createFakeSupabase(seed: Partial<FakeTables> = {}) {
  const tables: FakeTables = {
    print_jobs: (seed.print_jobs ?? []).map((row) => ({ ...row })),
    printer_commands: (seed.printer_commands ?? []).map((row) => ({ ...row })),
    printers: (seed.printers ?? []).map((row) => ({ ...row })),
    printer_events: (seed.printer_events ?? []).map((row) => ({ ...row })),
    print_job_notifications: (seed.print_job_notifications ?? []).map((row) => ({ ...row })),
  };

  const storageFiles = new Map<string, Buffer>();

  function from(table: keyof FakeTables) {
    function select(_columns?: string) {
      const filters: Filter[] = [];
      let orderColumn: string | undefined;
      let orderAscending = true;
      let limitN: number | undefined;

      function resolveRows(): Record<string, unknown>[] {
        let rows = applyFilters(tables[table], filters);
        if (orderColumn) {
          const col = orderColumn;
          rows = [...rows].sort((a, b) => {
            const av = a[col] as number | string | null;
            const bv = b[col] as number | string | null;
            if (av == null && bv == null) return 0;
            if (av == null) return 1; // nulls last, matching nullsFirst: false usage
            if (bv == null) return -1;
            if (av < bv) return orderAscending ? -1 : 1;
            if (av > bv) return orderAscending ? 1 : -1;
            return 0;
          });
        }
        if (limitN != null) rows = rows.slice(0, limitN);
        return rows;
      }

      const builder = {
        eq(column: string, value: unknown) {
          filters.push({ column, op: 'eq', value });
          return builder;
        },
        in(column: string, values: unknown[]) {
          filters.push({ column, op: 'in', value: values });
          return builder;
        },
        order(column: string, opts?: { ascending?: boolean }) {
          orderColumn = column;
          orderAscending = opts?.ascending ?? true;
          return builder;
        },
        limit(n: number) {
          limitN = n;
          return builder;
        },
        async single() {
          const rows = resolveRows();
          return rows.length === 1
            ? { data: rows[0], error: null }
            : {
                data: null,
                error: { message: `expected exactly 1 row in ${String(table)}, got ${rows.length}` } as FakeError,
              };
        },
        async maybeSingle() {
          const rows = resolveRows();
          if (rows.length > 1) {
            return {
              data: null,
              error: { message: `expected at most 1 row in ${String(table)}, got ${rows.length}` } as FakeError,
            };
          }
          return { data: rows[0] ?? null, error: null };
        },
      };
      return builder;
    }

    function update(patch: Record<string, unknown>) {
      return {
        eq: async (column: string, value: unknown) => {
          let matched = false;
          tables[table] = tables[table].map((row) => {
            if (row[column] !== value) return row;
            matched = true;
            return { ...row, ...patch };
          });
          return matched
            ? { error: null }
            : { error: { message: `${String(table)} row not found for ${column}=${String(value)}` } as FakeError };
        },
      };
    }

    function insert(row: Record<string, unknown>) {
      const fullRow: Record<string, unknown> = {
        id: makeId(),
        created_at: new Date().toISOString(),
        ...row,
      };

      const constraints = UNIQUE_CONSTRAINTS[table] ?? [];
      const violatedColumns = constraints.find((columns) =>
        tables[table].some((existing) => columns.every((col) => existing[col] === fullRow[col])),
      );

      let error: FakeError | null = null;
      if (violatedColumns) {
        error = {
          code: '23505',
          message: `duplicate key value violates unique constraint on ${String(table)}(${violatedColumns.join(',')})`,
        };
      } else {
        tables[table].push(fullRow);
      }

      return {
        // Bare `await supabase.from(x).insert(row)` — no row data returned, matching real supabase-js.
        then(resolve: (result: { data: null; error: FakeError | null }) => void) {
          resolve({ data: null, error });
        },
        select(_columns?: string) {
          return {
            single: async () => (error ? { data: null, error } : { data: fullRow, error: null }),
            maybeSingle: async () => (error ? { data: null, error } : { data: fullRow, error: null }),
          };
        },
      };
    }

    return { select, update, insert };
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
