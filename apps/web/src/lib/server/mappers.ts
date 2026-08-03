import type { BoardJobRecord, NotificationPreferencesRecord, PushSubscriptionRecord } from '@print-queue/shared';
import type { Database } from '../supabase/database.types';

type PrintJobRow = Database['public']['Tables']['print_jobs']['Row'];
type PushSubscriptionRow = Database['public']['Tables']['push_subscriptions']['Row'];
type NotificationPreferencesRow = Database['public']['Tables']['notification_preferences']['Row'];

export function mapBoardJob(row: PrintJobRow): BoardJobRecord {
  return {
    id: row.id,
    name: row.name,
    business: row.business,
    status: row.board_status,
    screenshotPath: row.screenshot_path,
    colors: row.colors,
    estimatedDurationSeconds: row.estimated_duration_seconds,
    notes: row.notes,
    queuePosition: row.queue_position,
    parentJobId: row.parent_job_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

export function mapPushSubscription(row: PushSubscriptionRow): PushSubscriptionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    userAgent: row.user_agent,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    disabledAt: row.disabled_at,
    lastSuccessAt: row.last_success_at,
    lastFailureAt: row.last_failure_at,
  };
}

export function mapNotificationPreferences(row: NotificationPreferencesRow): NotificationPreferencesRecord {
  return {
    userId: row.user_id,
    notifyOnPrintCompleted: row.notify_on_print_completed,
    notifyOnPrintFailed: row.notify_on_print_failed,
    notifyOnManualIntervention: row.notify_on_manual_intervention,
    notifyOnJobCompleted: row.notify_on_job_completed,
    notifyOnPartialCreated: row.notify_on_partial_created,
    notifyOnJobMoved: row.notify_on_job_moved,
    notifyOnQueueSummary: row.notify_on_queue_summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
