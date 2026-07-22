'use client';

import { BellOff, BellRing, Download, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { CheckboxRow } from '@/components/ui/Checkbox';
import {
  detectNotificationCapability,
  disablePushNotifications,
  enablePushNotifications,
  type NotificationCapability,
} from '@/lib/client/push';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

interface Preferences {
  notifyOnPrintCompleted: boolean;
  notifyOnPrintFailed: boolean;
  notifyOnManualIntervention: boolean;
}

export function NotificationSettings({
  userId,
  initialPreferences,
  activeDeviceCount,
}: {
  userId: string;
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

  useEffect(() => {
    setCapability(detectNotificationCapability());
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

  async function updatePreference(key: keyof Preferences, value: boolean) {
    const next = { ...preferences, [key]: value };
    setPreferences(next);

    const supabase = createSupabaseBrowserClient();
    const { error: upsertError } = await supabase.from('notification_preferences').upsert(
      {
        user_id: userId,
        notify_on_print_completed: next.notifyOnPrintCompleted,
        notify_on_print_failed: next.notifyOnPrintFailed,
        notify_on_manual_intervention: next.notifyOnManualIntervention,
      },
      { onConflict: 'user_id' },
    );
    if (upsertError) {
      setError(`Could not save preference: ${upsertError.message}`);
      setPreferences(preferences); // revert the optimistic update
    }
  }

  return (
    <div className="space-y-4">
      <StatusPanel
        capability={capability}
        busy={busy}
        deviceCount={deviceCount}
        onEnable={handleEnable}
        onDisable={handleDisable}
      />

      {error && <p className="text-sm font-medium text-danger-600">{error}</p>}

      <div className="space-y-2 border-t border-charcoal-100 pt-4">
        <p className="text-xs font-bold uppercase tracking-widest text-charcoal-400">Notify me when…</p>
        <CheckboxRow
          id="notify-print-completed"
          label="A print completes"
          description="Remove it and load the next job"
          checked={preferences.notifyOnPrintCompleted}
          onChange={(e) => void updatePreference('notifyOnPrintCompleted', e.target.checked)}
        />
        <CheckboxRow
          id="notify-print-failed"
          label="A print fails"
          description="Coming soon — saved now, not sent yet"
          checked={preferences.notifyOnPrintFailed}
          onChange={(e) => void updatePreference('notifyOnPrintFailed', e.target.checked)}
        />
        <CheckboxRow
          id="notify-manual-intervention"
          label="Manual intervention is required"
          description="Coming soon — saved now, not sent yet"
          checked={preferences.notifyOnManualIntervention}
          onChange={(e) => void updatePreference('notifyOnManualIntervention', e.target.checked)}
        />
      </div>
    </div>
  );
}

function StatusPanel({
  capability,
  busy,
  deviceCount,
  onEnable,
  onDisable,
}: {
  capability: NotificationCapability | null;
  busy: boolean;
  deviceCount: number;
  onEnable: () => void;
  onDisable: () => void;
}) {
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
        <div className="flex items-center justify-between gap-3">
          <span>
            {deviceCount} {deviceCount === 1 ? 'device' : 'devices'} subscribed.
          </span>
          <Button variant="secondary" size="md" onClick={onDisable} disabled={busy}>
            Disable on this device
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel icon={<BellOff className="h-5 w-5" />} tone="muted" title="Notifications disabled">
      <div className="flex flex-col items-start gap-3">
        <span>Get notified the moment a print finishes, right on this device.</span>
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
    <div className={`rounded-lg border p-4 text-sm ${TONE_CLASSES[tone]}`}>
      <div className="mb-1.5 flex items-center gap-2 font-bold">
        {icon}
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}
