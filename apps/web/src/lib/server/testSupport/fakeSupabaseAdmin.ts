import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../supabase/database.types';

/**
 * Minimal in-memory stand-in for the subset of supabase-js chains
 * lib/server/notifications.ts uses: `select().eq().single()`,
 * `select().eq()` / `select().in()` / `select().is()` awaited directly for
 * "give me every matching row" (no `.single()`), and `update().eq()`. See
 * apps/bridge/src/testSupport/fakeSupabase.ts for the bridge's parallel
 * (and slightly more capable, e.g. unique-constraint simulation) version —
 * kept separate because the two apps' Database types and table sets don't
 * overlap enough to be worth sharing.
 */
export interface FakeAdminTables {
  app_users: Record<string, unknown>[];
  push_subscriptions: Record<string, unknown>[];
  notification_preferences: Record<string, unknown>[];
  print_job_notifications: Record<string, unknown>[];
}

interface FakeError {
  message: string;
}

type Filter = { column: string; op: 'eq' | 'in' | 'is'; value: unknown };

function applyFilters(rows: Record<string, unknown>[], filters: Filter[]): Record<string, unknown>[] {
  return rows.filter((row) =>
    filters.every((f) => {
      if (f.op === 'in') return (f.value as unknown[]).includes(row[f.column]);
      return row[f.column] === f.value; // 'eq' and 'is' (e.g. is('disabled_at', null)) behave identically here
    }),
  );
}

export function createFakeSupabaseAdmin(seed: Partial<FakeAdminTables> = {}) {
  const tables: FakeAdminTables = {
    app_users: (seed.app_users ?? []).map((r) => ({ ...r })),
    push_subscriptions: (seed.push_subscriptions ?? []).map((r) => ({ ...r })),
    notification_preferences: (seed.notification_preferences ?? []).map((r) => ({ ...r })),
    print_job_notifications: (seed.print_job_notifications ?? []).map((r) => ({ ...r })),
  };

  function from(table: keyof FakeAdminTables) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept to mirror the real select(columns) signature
    function select(_columns?: string) {
      const filters: Filter[] = [];

      const builder = {
        eq(column: string, value: unknown) {
          filters.push({ column, op: 'eq', value });
          return builder;
        },
        in(column: string, values: unknown[]) {
          filters.push({ column, op: 'in', value: values });
          return builder;
        },
        is(column: string, value: unknown) {
          filters.push({ column, op: 'is', value });
          return builder;
        },
        async single() {
          const rows = applyFilters(tables[table], filters);
          return rows.length === 1
            ? { data: rows[0], error: null }
            : { data: null, error: { message: `expected exactly 1 row in ${String(table)}, got ${rows.length}` } as FakeError };
        },
        async maybeSingle() {
          const rows = applyFilters(tables[table], filters);
          return { data: rows[0] ?? null, error: null };
        },
        // Makes `await admin.from(x).select().eq(...)` (no `.single()`) resolve to every matching row.
        then(onFulfilled: (result: { data: Record<string, unknown>[]; error: null }) => unknown, onRejected?: (err: unknown) => unknown) {
          return Promise.resolve({ data: applyFilters(tables[table], filters), error: null }).then(onFulfilled, onRejected);
        },
      };
      return builder;
    }

    function update(patch: Record<string, unknown>) {
      return {
        eq: async (column: string, value: unknown) => {
          tables[table] = tables[table].map((row) => (row[column] === value ? { ...row, ...patch } : row));
          return { error: null };
        },
      };
    }

    return { select, update };
  }

  return {
    client: { from } as unknown as SupabaseClient<Database>,
    tables,
  };
}
