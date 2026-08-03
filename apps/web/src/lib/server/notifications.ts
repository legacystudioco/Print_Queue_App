import 'server-only';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type BoardJobNotificationData,
  type NotificationType,
  type PrintCompletedNotificationData,
  type PushNotificationPayload,
} from '@print-queue/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/database.types';
import { PERMANENTLY_INVALID_STATUS_CODES, sendPushNotification, type SendPushResult } from './webPush';

type AdminClient = SupabaseClient<Database>;
type SendPushFn = (
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushNotificationPayload,
) => Promise<SendPushResult>;

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface SendToSubscriptionsResult {
  sent: number;
  failed: number;
  disabled: number;
}

/**
 * The one place a push message actually goes out to a set of
 * subscriptions, plus the bookkeeping (last_success_at/last_failure_at,
 * and auto-disabling anything the push service reports as permanently
 * gone) that has to happen no matter which feature triggered the send.
 * Both `dispatchPrintJobNotification` (production print-completion
 * notifications) and `sendTestNotificationToUser` (the Settings "Send
 * Test Notification" button) call this — see docs/push-notifications.md.
 * Nothing about *how* a message is delivered should ever differ between
 * a real notification and a test one; only which subscriptions it's
 * addressed to and what's in the payload should differ.
 */
export async function sendPushToSubscriptions(
  admin: AdminClient,
  subscriptions: SubscriptionRow[],
  payload: PushNotificationPayload,
  sendPush: SendPushFn = sendPushNotification,
): Promise<SendToSubscriptionsResult> {
  let sent = 0;
  let failed = 0;
  let disabled = 0;
  const now = new Date().toISOString();

  for (const sub of subscriptions) {
    const result = await sendPush({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, payload);

    if (result.ok) {
      sent += 1;
      await admin.from('push_subscriptions').update({ last_success_at: now }).eq('id', sub.id);
    } else if (result.statusCode !== undefined && PERMANENTLY_INVALID_STATUS_CODES.has(result.statusCode)) {
      // The push service will never accept this endpoint again — disable
      // rather than hard-delete, so there's an audit trail (migration 0008).
      disabled += 1;
      await admin.from('push_subscriptions').update({ disabled_at: now, last_failure_at: now }).eq('id', sub.id);
    } else {
      failed += 1;
      await admin.from('push_subscriptions').update({ last_failure_at: now }).eq('id', sub.id);
    }
  }

  return { sent, failed, disabled };
}

const PREFERENCE_COLUMN: Record<
  NotificationType,
  | 'notify_on_print_completed'
  | 'notify_on_print_failed'
  | 'notify_on_manual_intervention'
  | 'notify_on_job_completed'
  | 'notify_on_partial_created'
  | 'notify_on_job_moved'
  | 'notify_on_queue_summary'
> = {
  print_completed: 'notify_on_print_completed',
  print_failed: 'notify_on_print_failed',
  manual_intervention_required: 'notify_on_manual_intervention',
  job_completed: 'notify_on_job_completed',
  partial_created: 'notify_on_partial_created',
  job_moved: 'notify_on_job_moved',
  queue_summary: 'notify_on_queue_summary',
};

const DEFAULT_BY_COLUMN: Record<string, boolean> = {
  notify_on_print_completed: DEFAULT_NOTIFICATION_PREFERENCES.notifyOnPrintCompleted,
  notify_on_print_failed: DEFAULT_NOTIFICATION_PREFERENCES.notifyOnPrintFailed,
  notify_on_manual_intervention: DEFAULT_NOTIFICATION_PREFERENCES.notifyOnManualIntervention,
  notify_on_job_completed: DEFAULT_NOTIFICATION_PREFERENCES.notifyOnJobCompleted,
  notify_on_partial_created: DEFAULT_NOTIFICATION_PREFERENCES.notifyOnPartialCreated,
  notify_on_job_moved: DEFAULT_NOTIFICATION_PREFERENCES.notifyOnJobMoved,
  notify_on_queue_summary: DEFAULT_NOTIFICATION_PREFERENCES.notifyOnQueueSummary,
};

export interface DispatchResult {
  notificationId: string;
  alreadyDispatched: boolean;
  sent: number;
  failed: number;
  disabled: number;
}

/**
 * Delivers one `print_job_notifications` row to every eligible subscriber:
 * active app_users, with an active (non-disabled) push subscription, whose
 * notification_preferences opt them into this notification's type (a
 * missing preferences row falls back to
 * @print-queue/shared's DEFAULT_NOTIFICATION_PREFERENCES rather than
 * silently sending nobody anything or requiring a row to exist upfront).
 *
 * Idempotent at the row level: a notification whose `dispatched_at` is
 * already set is treated as done and not re-sent — belt-and-suspenders
 * alongside the print_job_notifications unique constraint the bridge
 * relies on (see apps/bridge/src/statusReporter.ts).
 *
 * `sendPush` is injectable so this can be unit-tested without hitting a
 * real push service or needing VAPID keys configured — see
 * notifications.test.ts.
 */
/**
 * Every active user's active push subscriptions, filtered down to those
 * whose notification_preferences opt them into `notificationType` (a
 * missing preferences row falls back to
 * @print-queue/shared's DEFAULT_NOTIFICATION_PREFERENCES rather than
 * silently sending nobody anything or requiring a row to exist upfront).
 * Shared by `dispatchPrintJobNotification` and `sendQueueSummaryNotification`.
 */
async function getEligibleSubscriptions(
  admin: AdminClient,
  notificationType: NotificationType,
): Promise<SubscriptionRow[]> {
  const preferenceColumn = PREFERENCE_COLUMN[notificationType];

  const [{ data: activeUsers, error: usersError }, { data: subscriptions, error: subsError }] = await Promise.all([
    admin.from('app_users').select('id').eq('active', true),
    admin.from('push_subscriptions').select('*').is('disabled_at', null),
  ]);
  if (usersError) throw new Error(`Failed to load active users: ${usersError.message}`);
  if (subsError) throw new Error(`Failed to load push subscriptions: ${subsError.message}`);

  const activeUserIds = new Set((activeUsers ?? []).map((u) => u.id));
  const candidateSubs = (subscriptions ?? []).filter((sub) => activeUserIds.has(sub.user_id));

  const userIds = [...new Set(candidateSubs.map((sub) => sub.user_id))];
  const { data: preferences, error: prefsError } =
    userIds.length > 0
      ? await admin.from('notification_preferences').select('*').in('user_id', userIds)
      : { data: [], error: null };
  if (prefsError) throw new Error(`Failed to load notification preferences: ${prefsError.message}`);

  const preferenceByUserId = new Map((preferences ?? []).map((pref) => [pref.user_id, pref]));
  const defaultOptedIn = DEFAULT_BY_COLUMN[preferenceColumn];

  return candidateSubs.filter((sub) => {
    const pref = preferenceByUserId.get(sub.user_id);
    return pref ? Boolean(pref[preferenceColumn]) : defaultOptedIn;
  });
}

export async function dispatchPrintJobNotification(
  admin: AdminClient,
  notificationId: string,
  sendPush: SendPushFn = sendPushNotification,
): Promise<DispatchResult> {
  const { data: notification, error: notificationError } = await admin
    .from('print_job_notifications')
    .select('*')
    .eq('id', notificationId)
    .single();

  if (notificationError || !notification) {
    throw new Error(`Notification ${notificationId} not found: ${notificationError?.message ?? 'no row'}`);
  }

  if (notification.dispatched_at) {
    return { notificationId, alreadyDispatched: true, sent: 0, failed: 0, disabled: 0 };
  }

  const eligibleSubs = await getEligibleSubscriptions(admin, notification.notification_type);

  const payload: PushNotificationPayload = {
    title: notification.title,
    body: notification.body,
    data: notification.data as unknown as PrintCompletedNotificationData | BoardJobNotificationData,
  };

  const { sent, failed, disabled } = await sendPushToSubscriptions(admin, eligibleSubs, payload, sendPush);

  await admin
    .from('print_job_notifications')
    .update({ dispatched_at: new Date().toISOString() })
    .eq('id', notificationId);

  return { notificationId, alreadyDispatched: false, sent, failed, disabled };
}

export interface TestNotificationResult {
  /** False if the user had zero active push subscriptions — nothing was attempted. */
  hasSubscriptions: boolean;
  sent: number;
  failed: number;
  disabled: number;
}

const TEST_NOTIFICATION_PAYLOAD: Omit<PushNotificationPayload, 'data'> = {
  title: '🧪 Test Notification',
  body: 'Your Print Queue notifications are working correctly.',
};

/**
 * Sends a test push to every active subscription the given user owns —
 * called only from POST /api/notifications/test, itself only reachable by
 * that same signed-in user (see that route). Deliberately bypasses
 * `notification_preferences` (a test is an explicit, direct request, not
 * an automated notification someone may have opted out of) and doesn't
 * touch `print_job_notifications` at all — there is no real print job
 * behind a test send. Everything else — VAPID signing, the push service
 * call, and disabling a subscription the push service reports as
 * permanently gone — goes through the exact same `sendPushToSubscriptions`
 * production notifications use.
 */
export async function sendTestNotificationToUser(
  admin: AdminClient,
  userId: string,
  sendPush: SendPushFn = sendPushNotification,
): Promise<TestNotificationResult> {
  const { data: subscriptions, error } = await admin
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .is('disabled_at', null);

  if (error) throw new Error(`Failed to load push subscriptions for user ${userId}: ${error.message}`);

  if (!subscriptions || subscriptions.length === 0) {
    return { hasSubscriptions: false, sent: 0, failed: 0, disabled: 0 };
  }

  const payload: PushNotificationPayload = {
    ...TEST_NOTIFICATION_PAYLOAD,
    data: { type: 'test', url: '/settings' },
  };

  const { sent, failed, disabled } = await sendPushToSubscriptions(admin, subscriptions, payload, sendPush);
  return { hasSubscriptions: true, sent, failed, disabled };
}

type JobScopedNotificationType = 'job_completed' | 'partial_created' | 'job_moved';

/**
 * Records and immediately dispatches one job-scoped production-board
 * notification — the in-process replacement for what the old bridge did
 * over an HTTP webhook (see apps/bridge/src/statusReporter.ts, archived):
 * now that the event and the dispatch both happen inside the same Next.js
 * server, there is no webhook hop needed. Called from the
 * status/move-business/partial-reprint routes.
 *
 * `queue_summary` isn't about one job (see `sendQueueSummaryNotification`
 * below) — `print_job_notifications.print_job_id` is NOT NULL, so it can't
 * go through this same row-per-event path.
 */
export async function notifyJobEvent(
  admin: AdminClient,
  args: { jobId: string; type: JobScopedNotificationType; title: string; body: string; url: string },
  sendPush: SendPushFn = sendPushNotification,
): Promise<DispatchResult> {
  const data: BoardJobNotificationData = {
    type: args.type,
    jobId: args.jobId,
    jobName: null,
    url: args.url,
  };

  const { data: row, error } = await admin
    .from('print_job_notifications')
    .insert({
      print_job_id: args.jobId,
      printer_id: null,
      notification_type: args.type,
      title: args.title,
      body: args.body,
      // BoardJobNotificationData is a plain JSON-shaped object; the
      // generated Json type just doesn't structurally recognize a named
      // interface as an index signature.
      data: data as unknown as Database['public']['Tables']['print_job_notifications']['Insert']['data'],
    })
    .select('id')
    .single();

  if (error || !row) {
    throw new Error(`Failed to record notification for job ${args.jobId}: ${error?.message ?? 'no row returned'}`);
  }

  return dispatchPrintJobNotification(admin, row.id, sendPush);
}

export interface QueueSummaryResult {
  sent: number;
  failed: number;
  disabled: number;
}

/**
 * Sends an on-demand "here's what's on the board right now" push — the
 * Settings page's "Send Queue Summary Now" button. Deliberately not tied
 * to a `print_job_notifications` row (that table's schema is job-scoped;
 * a summary isn't about one job) — this is a direct send, same spirit as
 * `sendTestNotificationToUser`, just filtered by the real
 * notify_on_queue_summary preference instead of bypassing preferences.
 */
export async function sendQueueSummaryNotification(
  admin: AdminClient,
  body: string,
  sendPush: SendPushFn = sendPushNotification,
): Promise<QueueSummaryResult> {
  const eligibleSubs = await getEligibleSubscriptions(admin, 'queue_summary');

  const data: BoardJobNotificationData = {
    type: 'queue_summary',
    jobId: null,
    jobName: null,
    url: '/queue',
  };

  const payload: PushNotificationPayload = { title: '📋 Queue Summary', body, data };

  return sendPushToSubscriptions(admin, eligibleSubs, payload, sendPush);
}
