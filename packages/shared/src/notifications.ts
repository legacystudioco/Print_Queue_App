import { z } from 'zod';
import type { NotificationType } from './enums';

/**
 * Structured payload embedded in every push message's `data` field and
 * used to build the notification body — see docs/push-notifications.md.
 * Kept generic across notification types (only a few fields are always
 * present) so `print_failed`/`manual_intervention_required` can reuse it
 * later without a breaking shape change.
 */
export interface PrintCompletedNotificationData {
  type: 'print_completed';
  printerId: string;
  printerName: string;
  completedJobId: string;
  completedJobName: string;
  nextJobId: string | null;
  nextJobName: string | null;
  /** Where clicking the notification should navigate to — see sw.js. */
  url: string;
}

/** The actual shape handed to `web-push`'s `sendNotification` (JSON-stringified) and read by sw.js. */
export interface PushNotificationPayload {
  title: string;
  body: string;
  data: PrintCompletedNotificationData;
}

/** camelCase mirror of the `push_subscriptions` table. */
export interface PushSubscriptionRecord {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
  disabledAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
}

/** camelCase mirror of the `notification_preferences` table — one row per user. */
export interface NotificationPreferencesRecord {
  userId: string;
  notifyOnPrintCompleted: boolean;
  notifyOnPrintFailed: boolean;
  notifyOnManualIntervention: boolean;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: Omit<
  NotificationPreferencesRecord,
  'userId' | 'createdAt' | 'updatedAt'
> = {
  notifyOnPrintCompleted: true,
  notifyOnPrintFailed: false,
  notifyOnManualIntervention: false,
};

/** camelCase mirror of the `print_job_notifications` table — the idempotent completion record the bridge writes. */
export interface PrintJobNotificationRecord {
  id: string;
  printJobId: string;
  printerId: string;
  notificationType: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  createdAt: string;
  dispatchedAt: string | null;
}

/** The JSON shape a browser's `PushSubscription.toJSON()` produces — validated before it's ever written to the DB. */
export const webPushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});
export type WebPushSubscriptionInput = z.infer<typeof webPushSubscriptionSchema>;
