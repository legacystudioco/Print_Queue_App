'use client';

import { BellOff, BellRing, CheckCircle2, Download, FlaskConical, ShieldAlert, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { CheckboxRow } from '@/components/ui/Checkbox';
import {
  detectNotificationCapability,
  disablePushNotifications,
  enablePushNotifications,
  sendTestNotification,
  SendTestNotificationError,
  type NotificationCapability,
} from '@/lib/client/push';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type TestSendState = 'idle' | 'sending' | 'sent' | 'error';
type SummarySendState = 'idle' | 'sending' | 'sent' | 'error';

interface Preferences {
  notifyOnJobCompleted: boolean;
  notifyOnPartialCreated: boolean;
  notifyOnJobMoved: boolean;
  notifyOnQueueSummary: boolean;
}

export function NotificationSettings({
  userId,
  vapidConfigured,
  initialPreferences,
  activeDeviceCount,
}: {
  userId: string;
  /** False when NEXT_PUBLIC_VAPID_PUBLIC_KEY isn't set server-side — push cannot work at all regardless of browser support. See settings/page.tsx. */
  vapidConfigured: boolean;
  initialPreferences: Preferences;
  activeDeviceCount: number;
}) {
  // null = "haven't checked the browser yet" (avoids a server/client
  // mismatch flash — capability can only ever be determined client-side).
  const [capability, setCapability] = useState<NotificationCapability | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<Preferences>(initialPreferences);
  const [deviceCount, setDeviceCount] = useState(activeDeviceCount);
  const [testState, setTestState] = useState<TestSendState>('idle');
  const [testError, setTestError] = useState<string | null>(null);
  const testResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [summaryState, setSummaryState] = useState<SummarySendState>('idle');
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const summaryResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setCapability(detectNotificationCapability());
    return () => {
      if (testResetTimer.current) clearTimeout(testResetTimer.current);
    };
  }, []);

  async function handleEnable() {
    setBusy(true);
    setError(null);
    try {
      const result = await enablePushNotifications(userId);
      setCapability(result);
      if (result === 'granted') setDeviceCount((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enable notifications.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    setError(null);
    try {
      await disablePushNotifications(userId);
      setCapability('default');
      setDeviceCount((n) => Math.max(0, n - 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disable notifications.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSendTest() {
    if (testResetTimer.current) clearTimeout(testResetTimer.current);
    setTestState('sending');
    setTestError(null);
    try {
      const result = await sendTestNotification();
      setTestState('sent');
      // A disabled subscription just got auto-removed server-side — reflect
      // that here too instead of leaving a stale device count on screen.
      if (result.disabled > 0) setDeviceCount((n) => Math.max(0, n - result.disabled));
    } catch (err) {
      setTestState('error');
      setTestError(err instanceof Error ? err.message : 'Failed to send notification.');
      // Even a failed send can have disabled an expired subscription
      // server-side first (e.g. it was the only one) — still reflect that.
      if (err instanceof SendTestNotificationError && err.disabled > 0) {
        setDeviceCount((n) => Math.max(0, n - err.disabled));
      }
    } finally {
      testResetTimer.current = setTimeout(() => setTestState('idle'), 4000);
    }
  }

  async function updatePreference(key: keyof Preferences, value: boolean) {
    const next = { ...preferences, [key]: value };
    setPreferences(next);

    const supabase = createSupabaseBrowserClient();
    const { error: upsertError } = await supabase.from('notification_preferences').upsert(
      {
        user_id: userId,
        notify_on_job_completed: next.notifyOnJobCompleted,
        notify_on_partial_created: next.notifyOnPartialCreated,
        notify_on_job_moved: next.notifyOnJobMoved,
        notify_on_queue_summary: next.notifyOnQueueSummary,
      },
      { onConflict: 'user_id' },
    );
    if (upsertError) {
      setError(`Could not save preference: ${upsertError.message}`);
      setPreferences(preferences); // revert the optimistic update
    }
  }

  async function handleSendQueueSummary() {
    if (summaryResetTimer.current) clearTimeout(summaryResetTimer.current);
    setSummaryState('sending');
    setSummaryError(null);
    try {
      const res = await fetch('/api/notifications/queue-summary', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to send queue summary');
      }
      setSummaryState('sent');
    } catch (err) {
      setSummaryState('error');
      setSummaryError(err instanceof Error ? err.message : 'Failed to send queue summary');
    } finally {
      summaryResetTimer.current = setTimeout(() => setSummaryState('idle'), 4000);
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      <StatusPanel
        vapidConfigured={vapidConfigured}
        capability={capability}
        busy={busy}
        deviceCount={deviceCount}
        onEnable={handleEnable}
        onDisable={handleDisable}
        testState={testState}
        testError={testError}
        onSendTest={handleSendTest}
      />

      {error && <p className="break-words text-sm font-medium text-danger-600">{error}</p>}

      <div className="space-y-2 border-t border-charcoal-100 pt-4">
        <p className="text-xs font-bold uppercase tracking-widest text-charcoal-400">Notify me when…</p>
        <CheckboxRow
          id="notify-job-completed"
          label="A job completes"
          checked={preferences.notifyOnJobCompleted}
          onChange={(e) => void updatePreference('notifyOnJobCompleted', e.target.checked)}
        />
        <CheckboxRow
          id="notify-partial-created"
          label="A job is marked Partial"
          checked={preferences.notifyOnPartialCreated}
          onChange={(e) => void updatePreference('notifyOnPartialCreated', e.target.checked)}
        />
        <CheckboxRow
          id="notify-job-moved"
          label="A job moves to the other business"
          checked={preferences.notifyOnJobMoved}
          onChange={(e) => void updatePreference('notifyOnJobMoved', e.target.checked)}
        />
        <CheckboxRow
          id="notify-queue-summary"
          label="Queue summary"
          description="Only sent when you tap the button below"
          checked={preferences.notifyOnQueueSummary}
          onChange={(e) => void updatePreference('notifyOnQueueSummary', e.target.checked)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-charcoal-100 pt-4">
        <Button
          variant="secondary"
          size="md"
          onClick={handleSendQueueSummary}
          disabled={!preferences.notifyOnQueueSummary || summaryState === 'sending'}
          loading={summaryState === 'sending'}
        >
          {summaryState === 'idle' && 'Send Queue Summary Now'}
          {summaryState === 'sending' && 'Sending…'}
          {summaryState === 'sent' && 'Sent'}
          {summaryState === 'error' && 'Failed to send'}
        </Button>
        {summaryState === 'error' && summaryError && (
          <p className="break-words text-sm text-danger-600">{summaryError}</p>
        )}
      </div>
    </div>
  );
}

function StatusPanel({
  vapidConfigured,
  capability,
  busy,
  deviceCount,
  onEnable,
  onDisable,
  testState,
  testError,
  onSendTest,
}: {
  vapidConfigured: boolean;
  capability: NotificationCapability | null;
  busy: boolean;
  deviceCount: number;
  onEnable: () => void;
  onDisable: () => void;
  testState: TestSendState;
  testError: string | null;
  onSendTest: () => void;
}) {
  // Known server-side, identically on every render — safe to check before
  // the client-only capability detection below, and doesn't need the
  // pre-mount placeholder since there's no hydration mismatch risk here.
  if (!vapidConfigured) {
    return (
      <Panel icon={<ShieldAlert className="h-5 w-5" />} tone="muted" title="Notifications are not configured">
        This deployment hasn&apos;t set up push notifications yet. Ask an admin to configure it — see
        docs/push-notifications.md.
      </Panel>
    );
  }

  if (capability === null) {
    // Pre-mount / capability not yet detected — same on server and first
    // client render, so there's nothing for hydration to disagree about.
    return <div className="h-11" aria-hidden="true" />;
  }

  if (capability === 'unsupported') {
    return (
      <Panel icon={<ShieldAlert className="h-5 w-5" />} tone="muted" title="Unsupported browser">
        This browser doesn&apos;t support push notifications. Try Chrome, Edge, or Safari.
      </Panel>
    );
  }

  if (capability === 'ios-install-required') {
    return (
      <Panel icon={<Download className="h-5 w-5" />} tone="accent" title="Install the app to enable notifications">
        On iPhone/iPad, push notifications only work once this app is added to your Home Screen. Tap the
        Share icon in Safari, then &quot;Add to Home Screen&quot; — then open it from there and come back
        to this page.
      </Panel>
    );
  }

  if (capability === 'denied') {
    return (
      <Panel icon={<BellOff className="h-5 w-5" />} tone="danger" title="Permission denied">
        Notifications were blocked for this site. Enable them in your browser&apos;s site settings, then
        reload this page.
      </Panel>
    );
  }

  if (capability === 'granted') {
    return (
      <Panel icon={<BellRing className="h-5 w-5" />} tone="success" title="Notifications enabled">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="break-words">
            {deviceCount} {deviceCount === 1 ? 'device' : 'devices'} subscribed.
          </span>
          <Button variant="secondary" size="md" onClick={onDisable} disabled={busy}>
            Disable on this device
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-success-100 pt-3">
          <Button
            variant="secondary"
            size="md"
            onClick={onSendTest}
            disabled={testState === 'sending'}
            loading={testState === 'sending'}
          >
            {testState === 'idle' && (
              <>
                <FlaskConical className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
                Send Test Notification
              </>
            )}
            {testState === 'sending' && 'Sending…'}
            {testState === 'sent' && (
              <>
                <CheckCircle2 className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
                Notification Sent
              </>
            )}
            {testState === 'error' && (
              <>
                <XCircle className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
                Failed to send notification
              </>
            )}
          </Button>
          {testState === 'error' && testError && (
            <p className="break-words text-sm text-danger-600">{testError}</p>
          )}
        </div>
      </Panel>
    );
  }

  return (
    <Panel icon={<BellOff className="h-5 w-5" />} tone="muted" title="Notifications disabled">
      <div className="flex flex-col items-start gap-3">
        <span className="break-words">Get notified the moment a print finishes, right on this device.</span>
        <Button onClick={onEnable} disabled={busy} loading={busy}>
          Enable notifications
        </Button>
      </div>
    </Panel>
  );
}

const TONE_CLASSES = {
  muted: 'border-charcoal-200 bg-charcoal-50 text-charcoal-700',
  accent: 'border-brand-200 bg-brand-50 text-brand-800',
  success: 'border-success-100 bg-success-50 text-success-700',
  danger: 'border-danger-100 bg-danger-50 text-danger-700',
} as const;

function Panel({
  icon,
  title,
  tone,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tone: keyof typeof TONE_CLASSES;
  children: React.ReactNode;
}) {
  return (
    <div className={`min-w-0 rounded-lg border p-4 text-sm ${TONE_CLASSES[tone]}`}>
      <div className="mb-1.5 flex items-center gap-2 font-bold">
        <span className="shrink-0">{icon}</span>
        <span className="break-words">{title}</span>
      </div>
      <div className="break-words">{children}</div>
    </div>
  );
}
