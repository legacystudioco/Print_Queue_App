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

/**
 * Sent by POST /api/notifications/test (see lib/server/notifications.ts's
 * sendTestNotificationToUser) — deliberately minimal, since its only job is
 * proving the push pipeline (VAPID signing, push service delivery, service
 * worker `push`/`notificationclick` handling) actually works end to end.
 */
export interface TestNotificationData {
  type: 'test';
  /** Where clicking the notification should navigate to — see sw.js. */
  url: string;
}

/**
 * Data payload for the production board's four notification types (see
 * `notifyPlateEvent`/`notifyJobMoved` in apps/web/src/lib/server/notifications.ts).
 * `job_completed`/`partial_created` are plate-level actions in the
 * customer/plate hierarchy (migration 0018) — `plateId` is set and
 * `jobName` holds the plate's name. `job_moved` is a customer-level drag
 * action — `plateId` is null and `jobName` holds the customer name.
 * `jobId`/`jobName`/`plateId` are all omitted (null) for `queue_summary`,
 * which isn't about one job.
 */
export interface BoardJobNotificationData {
  type: 'job_completed' | 'partial_created' | 'job_moved' | 'queue_summary';
  jobId: string | null;
  plateId: string | null;
  jobName: string | null;
  /** Where clicking the notification should navigate to — see sw.js. */
  url: string;
}

/** The actual shape handed to `web-push`'s `sendNotification` (JSON-stringified) and read by sw.js. */
export interface PushNotificationPayload {
  title: string;
  body: string;
  data: PrintCompletedNotificationData | TestNotificationData | BoardJobNotificationData;
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

/**
 * camelCase mirror of the `notification_preferences` table — one row per
 * user. The `notifyOnPrint*` fields are archived leftovers from the
 * printer-automation era (no longer read by the app); the production board
 * reads the `notifyOnJob*`/`notifyOnQueueSummary` fields.
 */
export interface NotificationPreferencesRecord {
  userId: string;
  notifyOnPrintCompleted: boolean;
  notifyOnPrintFailed: boolean;
  notifyOnManualIntervention: boolean;
  notifyOnJobCompleted: boolean;
  notifyOnPartialCreated: boolean;
  notifyOnJobMoved: boolean;
  notifyOnQueueSummary: boolean;
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
  notifyOnJobCompleted: true,
  notifyOnPartialCreated: true,
  notifyOnJobMoved: false,
  notifyOnQueueSummary: false,
};

/** camelCase mirror of the `print_job_notifications` table. `printerId` is null for production-board events (see migration 0017). */
export interface PrintJobNotificationRecord {
  id: string;
  printJobId: string;
  printerId: string | null;
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
