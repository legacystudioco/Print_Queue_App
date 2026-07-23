import type { ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mocking these means the real `next/headers` (which `lib/supabase/server`
// depends on and which throws outside an actual request) is never touched
// — this file runs under Vitest's default 'node' environment (no `window`,
// no `document`, no jsdom) specifically so a passing render here is direct
// proof the Settings Server Component never reaches for a browser global
// during module init or render.
vi.mock('@/lib/server/auth', () => ({ getCurrentAppUser: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock('@/lib/server/data', () => ({
  getNotificationPreferences: vi.fn(),
  getPushSubscriptions: vi.fn(),
}));

import { getCurrentAppUser } from '@/lib/server/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getNotificationPreferences, getPushSubscriptions } from '@/lib/server/data';
import SettingsPage from './page';

const USER = { id: 'user-1', email: 'a@example.com', displayName: null, role: 'operator' as const, active: true };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createSupabaseServerClient).mockResolvedValue({} as never);
});

describe('SettingsPage — no browser globals at render time', () => {
  it('confirms this test runs with no window/document (Node environment), proving the page cannot depend on them', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
  });
});

describe('SettingsPage — resilience', () => {
  it('renders a "signed out" message instead of crashing when there is no authenticated user', async () => {
    vi.mocked(getCurrentAppUser).mockResolvedValue(null);

    const element = await SettingsPage();
    const html = renderToString(element as ReactElement);

    expect(html).toMatch(/signed out/i);
  });

  it('renders normally when both notification queries return their happy-path data', async () => {
    vi.mocked(getCurrentAppUser).mockResolvedValue(USER);
    vi.mocked(getNotificationPreferences).mockResolvedValue({
      userId: USER.id,
      notifyOnPrintCompleted: true,
      notifyOnPrintFailed: false,
      notifyOnManualIntervention: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });
    vi.mocked(getPushSubscriptions).mockResolvedValue([]);

    const element = await SettingsPage();
    const html = renderToString(element as ReactElement);

    expect(html).toMatch(/notifications/i);
  });

  it('still renders — does not throw — when getNotificationPreferences resolves null (the safe fallback for a query failure)', async () => {
    vi.mocked(getCurrentAppUser).mockResolvedValue(USER);
    vi.mocked(getNotificationPreferences).mockResolvedValue(null);
    vi.mocked(getPushSubscriptions).mockResolvedValue([]);

    const element = await SettingsPage();
    expect(() => renderToString(element as ReactElement)).not.toThrow();
  });

  it('still renders — does not throw — when getPushSubscriptions resolves an empty array (the safe fallback for a query failure)', async () => {
    vi.mocked(getCurrentAppUser).mockResolvedValue(USER);
    vi.mocked(getNotificationPreferences).mockResolvedValue(null);
    vi.mocked(getPushSubscriptions).mockResolvedValue([]);

    const element = await SettingsPage();
    const html = renderToString(element as ReactElement);

    // 0 active subscriptions must not crash pluralization/formatting.
    expect(html).not.toMatch(/undefined|NaN/);
  });
});
