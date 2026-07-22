import type {
  BedClearConfirmationRecord,
  JobAmsSlotRecord,
  NotificationPreferencesRecord,
  PrinterCommandRecord,
  PrinterEventRecord,
  PrinterRecord,
  PrintJobRecord,
  PrintJobWithSlots,
  PushSubscriptionRecord,
} from '@print-queue/shared';
import type { Database } from '../supabase/database.types';

type PrinterRow = Database['public']['Tables']['printers']['Row'];
type PrintJobRow = Database['public']['Tables']['print_jobs']['Row'];
type JobAmsSlotRow = Database['public']['Tables']['job_ams_slots']['Row'];
type PrinterCommandRow = Database['public']['Tables']['printer_commands']['Row'];
type PrinterEventRow = Database['public']['Tables']['printer_events']['Row'];
type BedClearConfirmationRow = Database['public']['Tables']['bed_clear_confirmations']['Row'];
type PushSubscriptionRow = Database['public']['Tables']['push_subscriptions']['Row'];
type NotificationPreferencesRow = Database['public']['Tables']['notification_preferences']['Row'];

export function mapPrinter(row: PrinterRow): PrinterRecord {
  return {
    id: row.id,
    name: row.name,
    model: row.model,
    serialNumber: row.serial_number,
    localIp: row.local_ip,
    bridgeId: row.bridge_id,
    status: row.status,
    lastSeenAt: row.last_seen_at,
    currentJobId: row.current_job_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPrintJob(row: PrintJobRow): PrintJobRecord {
  return {
    id: row.id,
    printerId: row.printer_id,
    name: row.name,
    originalFilename: row.original_filename,
    storagePath: row.storage_path,
    fileSizeBytes: row.file_size_bytes,
    queuePosition: row.queue_position,
    status: row.status,
    estimatedDurationSeconds: row.estimated_duration_seconds,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    failureMessage: row.failure_message,
  };
}

export function mapAmsSlot(row: JobAmsSlotRow): JobAmsSlotRecord {
  return {
    id: row.id,
    jobId: row.job_id,
    slotNumber: row.slot_number as 1 | 2 | 3 | 4,
    colorName: row.color_name,
    materialName: row.material_name,
    notes: row.notes,
    isUsed: row.is_used,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPrintJobWithSlots(
  job: PrintJobRow,
  slots: JobAmsSlotRow[],
): PrintJobWithSlots {
  return {
    ...mapPrintJob(job),
    amsSlots: slots.map(mapAmsSlot).sort((a, b) => a.slotNumber - b.slotNumber),
  };
}

export function mapPrinterCommand(row: PrinterCommandRow): PrinterCommandRecord {
  return {
    id: row.id,
    printerId: row.printer_id,
    printJobId: row.print_job_id,
    commandType: row.command_type,
    status: row.status,
    requestedBy: row.requested_by,
    requestedAt: row.requested_at,
    claimedAt: row.claimed_at,
    claimedByBridge: row.claimed_by_bridge,
    completedAt: row.completed_at,
    errorMessage: row.error_message,
    attemptCount: row.attempt_count,
    idempotencyKey: row.idempotency_key,
    payload: row.payload,
    result: row.result,
  };
}

export function mapPrinterEvent(row: PrinterEventRow): PrinterEventRecord {
  return {
    id: row.id,
    printerId: row.printer_id,
    printJobId: row.print_job_id,
    eventType: row.event_type,
    message: row.message,
    payload: row.payload,
    createdAt: row.created_at,
  };
}

export function mapBedClearConfirmation(
  row: BedClearConfirmationRow,
): BedClearConfirmationRecord {
  return {
    id: row.id,
    printJobId: row.print_job_id,
    confirmedBy: row.confirmed_by,
    previousPrintRemoved: row.previous_print_removed,
    buildPlateClear: row.build_plate_clear,
    amsVerified: row.ams_verified,
    createdAt: row.created_at,
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
