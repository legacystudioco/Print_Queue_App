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

  let sent = 0;
  let failed = 0;
  let disabled = 0;
  const now = new Date().toISOString();

  for (const sub of eligibleSubs) {
    const result = await sendPush({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, payload);

    if (result.ok) {
      sent += 1;
      await admin.from('push_subscriptions').update({ last_success_at: now }).eq('id', sub.id);
    } else if (result.statusCode !== undefined && PERMANENTLY_INVALID_STATUS_CODES.has(result.statusCode)) {
      // The push service will never accept this endpoint again — disable
      // rather than delete, so there's an audit trail (see migration 0008).
      disabled += 1;
      await admin.from('push_subscriptions').update({ disabled_at: now, last_failure_at: now }).eq('id', sub.id);
    } else {
      failed += 1;
      await admin.from('push_subscriptions').update({ last_failure_at: now }).eq('id', sub.id);
    }
  }

  await admin.from('print_job_notifications').update({ dispatched_at: now }).eq('id', notificationId);

  return { notificationId, alreadyDispatched: false, sent, failed, disabled };
}
