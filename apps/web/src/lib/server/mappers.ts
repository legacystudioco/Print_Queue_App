import type {
  BoardJobRecord,
  JobRecord,
  JobTemplatePlateRecord,
  JobTemplateRecord,
  NotificationPreferencesRecord,
  PlateRecord,
  PushSubscriptionRecord,
} from '@print-queue/shared';
import type { Database } from '../supabase/database.types';

type PrintJobRow = Database['public']['Tables']['print_jobs']['Row'];
type PushSubscriptionRow = Database['public']['Tables']['push_subscriptions']['Row'];
type NotificationPreferencesRow = Database['public']['Tables']['notification_preferences']['Row'];
type JobRow = Database['public']['Tables']['jobs']['Row'];
type PlateRow = Database['public']['Tables']['plates']['Row'];
type JobTemplateRow = Database['public']['Tables']['job_templates']['Row'];
type JobTemplatePlateRow = Database['public']['Tables']['job_template_plates']['Row'];

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

export function mapJob(row: JobRow): JobRecord {
  return {
    id: row.id,
    customerName: row.customer_name,
    business: row.business,
    notes: row.notes,
    queuePosition: row.queue_position,
    createdBy: row.created_by,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

export function mapPlate(row: PlateRow): PlateRecord {
  return {
    id: row.id,
    jobId: row.job_id,
    plateName: row.plate_name,
    screenshotPath: row.screenshot_path,
    colors: row.colors,
    estimatedDurationSeconds: row.estimated_duration_seconds,
    notes: row.notes,
    status: row.status,
    parentPlateId: row.parent_plate_id,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

export function mapJobTemplate(row: JobTemplateRow): JobTemplateRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    defaultBusiness: row.default_business,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

export function mapJobTemplatePlate(row: JobTemplatePlateRow): JobTemplatePlateRecord {
  return {
    id: row.id,
    templateId: row.template_id,
    plateName: row.plate_name,
    screenshotPath: row.screenshot_path,
    colors: row.colors,
    estimatedDurationSeconds: row.estimated_duration_seconds,
    notes: row.notes,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
