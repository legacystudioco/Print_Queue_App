import { describe, expect, it, vi } from 'vitest';
import { getNotificationPreferences, getPushSubscriptions } from './data';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/database.types';

/**
 * getPushSubscriptions/getNotificationPreferences are the two functions
 * that, before this fix, threw a raw Postgres/PostgREST error straight out
 * of the Settings Server Component whenever the notification tables were
 * missing or the query otherwise failed (root cause of the "Something went
 * wrong" crash — see docs/push-notifications.md). Unlike every other
 * function in data.ts, these must degrade to a safe fallback instead.
 */

function fakePushSubscriptionsQuery(result: { data: unknown; error: unknown }) {
  const order2 = vi.fn().mockResolvedValue(result);
  const order1 = vi.fn().mockReturnValue({ order: order2 });
  const eq = vi.fn().mockReturnValue({ order: order1 });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { from: from as unknown as SupabaseClient<Database>['from'] };
}

function fakeNotificationPreferencesQuery(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { from: from as unknown as SupabaseClient<Database>['from'] };
}

describe('getPushSubscriptions', () => {
  it('returns the mapped rows on success', async () => {
    const client = fakePushSubscriptionsQuery({
      data: [
        {
          id: 'sub-1',
          user_id: 'user-1',
          endpoint: 'https://push.example.com/a',
          p256dh: 'p',
          auth: 'a',
          user_agent: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          disabled_at: null,
          last_success_at: null,
          last_failure_at: null,
        },
      ],
      error: null,
    });

    const result = await getPushSubscriptions(client as unknown as SupabaseClient<Database>, 'user-1');
    expect(result).toHaveLength(1);
    expect(result[0]?.endpoint).toBe('https://push.example.com/a');
  });

  it('returns an empty array instead of throwing when the table is missing (PGRST205) or any other query error occurs', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = fakePushSubscriptionsQuery({
      data: null,
      error: { message: "Could not find the table 'public.push_subscriptions' in the schema cache", code: 'PGRST205' },
    });

    const result = await getPushSubscriptions(client as unknown as SupabaseClient<Database>, 'user-1');

    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns an empty array (not null/undefined) when there are simply no rows', async () => {
    const client = fakePushSubscriptionsQuery({ data: [], error: null });
    const result = await getPushSubscriptions(client as unknown as SupabaseClient<Database>, 'user-1');
    expect(result).toEqual([]);
  });
});

describe('getNotificationPreferences', () => {
  it('returns the mapped row on success', async () => {
    const client = fakeNotificationPreferencesQuery({
      data: {
        user_id: 'user-1',
        notify_on_print_completed: true,
        notify_on_print_failed: false,
        notify_on_manual_intervention: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    });

    const result = await getNotificationPreferences(client as unknown as SupabaseClient<Database>, 'user-1');
    expect(result?.notifyOnPrintCompleted).toBe(true);
  });

  it('returns null instead of throwing when the table is missing or the query otherwise fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = fakeNotificationPreferencesQuery({
      data: null,
      error: { message: "Could not find the table 'public.notification_preferences' in the schema cache", code: 'PGRST205' },
    });

    const result = await getNotificationPreferences(client as unknown as SupabaseClient<Database>, 'user-1');

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns null (the same, already-handled shape) when the user simply has no preferences row yet', async () => {
    const client = fakeNotificationPreferencesQuery({ data: null, error: null });
    const result = await getNotificationPreferences(client as unknown as SupabaseClient<Database>, 'user-1');
    expect(result).toBeNull();
  });
});
