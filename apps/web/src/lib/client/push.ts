import { webPushSubscriptionSchema } from '@print-queue/shared';
import { getVapidPublicKey } from './env';
import { createSupabaseBrowserClient } from '../supabase/client';

export type NotificationCapability =
  | 'unsupported'
  | 'ios-install-required'
  | 'default'
  | 'granted'
  | 'denied';

/**
 * iOS/iPadOS only exposes the Push API inside an installed Home Screen PWA
 * (standalone display mode) — in a regular Safari tab `PushManager` simply
 * doesn't exist, indistinguishable at the API level from "this browser
 * doesn't support push at all". Detecting iOS specifically lets Settings
 * show "Install app to enable notifications" instead of the more generic,
 * less actionable "Unsupported browser".
 */
export function isIosDevice(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  if (/iP(hone|od|ad)/.test(userAgent)) return true;
  // iPadOS 13+ reports as "MacIntel" but, unlike a real Mac, has touch support.
  return platform === 'MacIntel' && maxTouchPoints > 1;
}

export function isStandaloneDisplayMode(matchesStandaloneMediaQuery: boolean, navigatorStandalone: boolean | undefined): boolean {
  return matchesStandaloneMediaQuery || navigatorStandalone === true;
}

/** Pure decision function — see push.test.ts for every input combination this covers. */
export function resolveNotificationCapability(input: {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  isIos: boolean;
  isStandalone: boolean;
  permission: NotificationPermission | undefined;
}): NotificationCapability {
  const apiSupported = input.hasServiceWorker && input.hasPushManager && input.hasNotification;

  if (!apiSupported) {
    if (input.isIos && !input.isStandalone) return 'ios-install-required';
    return 'unsupported';
  }

  if (input.permission === 'denied') return 'denied';
  if (input.permission === 'granted') return 'granted';
  return 'default';
}

/** Reads real browser state — the only non-pure part of capability detection. Call only on the client. */
export function detectNotificationCapability(): NotificationCapability {
  const nav = navigator as Navigator & { standalone?: boolean };
  return resolveNotificationCapability({
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
    isIos: isIosDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints),
    isStandalone: isStandaloneDisplayMode(window.matchMedia('(display-mode: standalone)').matches, nav.standalone),
    permission: 'Notification' in window ? Notification.permission : undefined,
  });
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

/**
 * The full opt-in flow: MUST be called from a click handler, never on
 * mount — `Notification.requestPermission()` silently resolves to
 * `'denied'` (with no prompt at all, in most browsers) if it isn't
 * triggered by a user gesture.
 */
export async function enablePushNotifications(userId: string): Promise<NotificationCapability> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return permission === 'denied' ? 'denied' : 'default';
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(getVapidPublicKey()) as BufferSource,
    });
  }

  const parsed = webPushSubscriptionSchema.parse(subscription.toJSON());
  const supabase = createSupabaseBrowserClient();

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: parsed.endpoint,
      p256dh: parsed.keys.p256dh,
      auth: parsed.keys.auth,
      user_agent: navigator.userAgent,
      disabled_at: null,
    },
    { onConflict: 'user_id,endpoint' },
  );
  if (error) throw error;

  return 'granted';
}

/** Unsubscribes this device only — other devices/browsers this user enabled notifications on are untouched. */
export async function disablePushNotifications(userId: string): Promise<void> {
  if (!('serviceWorker' in navigator)) return;

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();

  const supabase = createSupabaseBrowserClient();
  await supabase
    .from('push_subscriptions')
    .update({ disabled_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('endpoint', endpoint);
}
