/**
 * Hand-authored mirror of the Supabase schema (see supabase/migrations).
 *
 * Once a real Supabase project exists, regenerate this file with
 * `pnpm db:types` (requires SUPABASE_PROJECT_ID and the Supabase CLI to be
 * logged in) and diff it against this version — they should match.
 */

export type UserRole = 'admin' | 'operator';

export type PrinterStatusDb =
  | 'online'
  | 'offline'
  | 'idle'
  | 'preparing'
  | 'printing'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'unknown';

export type PrintJobStatusDb =
  | 'uploaded'
  | 'queued'
  | 'ready'
  | 'command_pending'
  | 'downloading'
  | 'uploading_to_printer'
  | 'starting'
  | 'printing'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export type PrinterCommandTypeDb =
  | 'start_print'
  | 'refresh_status'
  | 'cancel_print'
  | 'pause_print'
  | 'resume_print';

export type PrinterCommandStatusDb =
  | 'pending'
  | 'claimed'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

type AppUsersRow = {
  id: string;
  email: string;
  display_name: string | null;
  role: UserRole;
  active: boolean;
  created_at: string;
  updated_at: string;
};

type PrintersRow = {
  id: string;
  name: string;
  model: string;
  serial_number: string | null;
  local_ip: string | null;
  bridge_id: string | null;
  status: PrinterStatusDb;
  last_seen_at: string | null;
  current_job_id: string | null;
  created_at: string;
  updated_at: string;
};

type PrintJobsRow = {
  id: string;
  printer_id: string;
  name: string;
  original_filename: string;
  storage_path: string;
  file_size_bytes: number;
  queue_position: number | null;
  status: PrintJobStatusDb;
  estimated_duration_seconds: number | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  failure_message: string | null;
};

type JobAmsSlotsRow = {
  id: string;
  job_id: string;
  slot_number: number;
  color_name: string | null;
  material_name: string | null;
  notes: string | null;
  is_used: boolean;
  created_at: string;
  updated_at: string;
};

type PrinterCommandsRow = {
  id: string;
  printer_id: string;
  print_job_id: string | null;
  command_type: PrinterCommandTypeDb;
  status: PrinterCommandStatusDb;
  requested_by: string;
  requested_at: string;
  claimed_at: string | null;
  claimed_by_bridge: string | null;
  completed_at: string | null;
  error_message: string | null;
  attempt_count: number;
  idempotency_key: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
};

type PrinterEventsRow = {
  id: string;
  printer_id: string;
  print_job_id: string | null;
  event_type: string;
  message: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type BedClearConfirmationsRow = {
  id: string;
  print_job_id: string;
  confirmed_by: string;
  previous_print_removed: boolean;
  build_plate_clear: boolean;
  ams_verified: boolean;
  created_at: string;
};

export type NotificationTypeDb = 'print_completed' | 'print_failed' | 'manual_intervention_required';

type PushSubscriptionsRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
  disabled_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
};

type NotificationPreferencesRow = {
  user_id: string;
  notify_on_print_completed: boolean;
  notify_on_print_failed: boolean;
  notify_on_manual_intervention: boolean;
  created_at: string;
  updated_at: string;
};

type PrintJobNotificationsRow = {
  id: string;
  print_job_id: string;
  printer_id: string;
  notification_type: NotificationTypeDb;
  title: string;
  body: string;
  data: Record<string, unknown>;
  created_at: string;
  dispatched_at: string | null;
};

export interface Database {
  public: {
    Tables: {
      app_users: {
        Row: AppUsersRow;
        Insert: Partial<AppUsersRow> & Pick<AppUsersRow, 'id' | 'email'>;
        Update: Partial<AppUsersRow>;
        Relationships: [];
      };
      printers: {
        Row: PrintersRow;
        Insert: Partial<PrintersRow> & Pick<PrintersRow, 'name'>;
        Update: Partial<PrintersRow>;
        Relationships: [];
      };
      print_jobs: {
        Row: PrintJobsRow;
        Insert: Partial<PrintJobsRow> &
          Pick<
            PrintJobsRow,
            'printer_id' | 'name' | 'original_filename' | 'storage_path' | 'file_size_bytes' | 'created_by'
          >;
        Update: Partial<PrintJobsRow>;
        Relationships: [];
      };
      job_ams_slots: {
        Row: JobAmsSlotsRow;
        Insert: Partial<JobAmsSlotsRow> & Pick<JobAmsSlotsRow, 'job_id' | 'slot_number'>;
        Update: Partial<JobAmsSlotsRow>;
        Relationships: [];
      };
      printer_commands: {
        Row: PrinterCommandsRow;
        Insert: Partial<PrinterCommandsRow> &
          Pick<PrinterCommandsRow, 'printer_id' | 'command_type' | 'requested_by' | 'idempotency_key'>;
        Update: Partial<PrinterCommandsRow>;
        Relationships: [];
      };
      printer_events: {
        Row: PrinterEventsRow;
        Insert: Partial<PrinterEventsRow> & Pick<PrinterEventsRow, 'printer_id' | 'event_type' | 'message'>;
        Update: Partial<PrinterEventsRow>;
        Relationships: [];
      };
      bed_clear_confirmations: {
        Row: BedClearConfirmationsRow;
        Insert: Partial<BedClearConfirmationsRow> &
          Pick<
            BedClearConfirmationsRow,
            'print_job_id' | 'confirmed_by' | 'previous_print_removed' | 'build_plate_clear' | 'ams_verified'
          >;
        Update: Partial<BedClearConfirmationsRow>;
        Relationships: [];
      };
      push_subscriptions: {
        Row: PushSubscriptionsRow;
        Insert: Partial<PushSubscriptionsRow> &
          Pick<PushSubscriptionsRow, 'user_id' | 'endpoint' | 'p256dh' | 'auth'>;
        Update: Partial<PushSubscriptionsRow>;
        Relationships: [];
      };
      notification_preferences: {
        Row: NotificationPreferencesRow;
        Insert: Partial<NotificationPreferencesRow> & Pick<NotificationPreferencesRow, 'user_id'>;
        Update: Partial<NotificationPreferencesRow>;
        Relationships: [];
      };
      print_job_notifications: {
        Row: PrintJobNotificationsRow;
        Insert: Partial<PrintJobNotificationsRow> &
          Pick<PrintJobNotificationsRow, 'print_job_id' | 'printer_id' | 'notification_type' | 'title' | 'body'>;
        Update: Partial<PrintJobNotificationsRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_print_job: {
        Args: {
          p_id: string;
          p_printer_id: string;
          p_name: string;
          p_original_filename: string;
          p_storage_path: string;
          p_file_size_bytes: number;
          p_estimated_duration_seconds: number | null;
          p_notes: string | null;
          p_created_by: string;
          p_ams_slots: unknown;
        };
        Returns: PrintJobsRow;
      };
      reorder_queue: {
        Args: { p_printer_id: string; p_ordered_job_ids: string[] };
        Returns: undefined;
      };
      retry_print_job: {
        Args: { p_job_id: string };
        Returns: PrintJobsRow;
      };
      requeue_print_job: {
        Args: { p_new_id: string; p_source_job_id: string; p_created_by: string };
        Returns: PrintJobsRow;
      };
      start_next_print: {
        Args: {
          p_job_id: string;
          p_printer_id: string;
          p_requested_by: string;
          p_idempotency_key: string;
          p_previous_print_removed: boolean;
          p_build_plate_clear: boolean;
          p_ams_verified: boolean;
        };
        Returns: PrinterCommandsRow;
      };
      claim_next_printer_command: {
        Args: { p_printer_id: string; p_bridge_id: string };
        Returns: PrinterCommandsRow[];
      };
    };
  };
}
