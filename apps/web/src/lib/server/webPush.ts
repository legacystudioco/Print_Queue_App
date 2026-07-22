import 'server-only';
import webpush from 'web-push';
import type { PushNotificationPayload } from '@print-queue/shared';
import { getVapidPrivateKey, getVapidPublicKey, getVapidSubject } from './notificationEnv';

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Web Push service responses that mean "this subscription is gone for good" — see RFC 8030 / the Push API spec. Never retry these; disable the subscription instead. */
export const PERMANENTLY_INVALID_STATUS_CODES = new Set([404, 410]);

export interface SendPushResult {
  ok: boolean;
  /** Present when !ok — lets the caller decide whether to disable the subscription (404/410) or just log a transient failure. */
  statusCode?: number;
}

/**
 * Thin wrapper around `web-push`'s `sendNotification` — isolates the one
 * function in this codebase that actually needs VAPID credentials, so
 * dispatch logic (lib/server/notifications.ts) can be unit-tested by
 * injecting a fake instead of hitting a real push service.
 */
export async function sendPushNotification(
  subscription: PushSubscriptionKeys,
  payload: PushNotificationPayload,
): Promise<SendPushResult> {
  webpush.setVapidDetails(getVapidSubject(), getVapidPublicKey(), getVapidPrivateKey());

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
    );
    return { ok: true };
  } catch (err) {
    const statusCode = err instanceof webpush.WebPushError ? err.statusCode : undefined;
    return { ok: false, statusCode };
  }
}
