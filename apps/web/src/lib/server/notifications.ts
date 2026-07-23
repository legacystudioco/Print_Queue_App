import 'server-only';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
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

const PREFERENCE_COLUMN: Record<NotificationType, 'notify_on_print_completed' | 'notify_on_print_failed' | 'notify_on_manual_intervention'> = {
  print_completed: 'notify_on_print_completed',
  print_failed: 'notify_on_print_failed',
  manual_intervention_required: 'notify_on_manual_intervention',
};

const DEFAULT_BY_COLUMN: Record<string, boolean> = {
  notify_on_print_completed: DEFAULT_NOTIFICATION_PREFERENCES.notifyOnPrintCompleted,
  notify_on_print_failed: DEFAULT_NOTIFICATION_PREFERENCES.notifyOnPrintFailed,
  notify_on_manual_intervention: DEFAULT_NOTIFICATION_PREFERENCES.notifyOnManualIntervention,
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

  const preferenceColumn = PREFERENCE_COLUMN[notification.notification_type];

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

  const eligibleSubs = candidateSubs.filter((sub) => {
    const pref = preferenceByUserId.get(sub.user_id);
    return pref ? Boolean(pref[preferenceColumn]) : defaultOptedIn;
  });

  const payload: PushNotificationPayload = {
    title: notification.title,
    body: notification.body,
    data: notification.data as unknown as PrintCompletedNotificationData,
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
