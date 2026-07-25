/**
 * Minimal mirror of the Supabase schema (see supabase/migrations) — only the
 * tables/functions the bridge actually touches. Keep in sync with
 * apps/web/src/lib/supabase/database.types.ts by hand; if this drifts,
 * `pnpm db:types` against the real project is the source of truth.
 */

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
  | 'deliver_print'
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

export type PrinterBrandDb = 'bambu' | 'snapmaker' | 'flashforge';

export type PrintersRow = {
  id: string;
  name: string;
  model: string;
  brand: PrinterBrandDb;
  serial_number: string | null;
  local_ip: string | null;
  bridge_id: string | null;
  enabled: boolean;
  status: PrinterStatusDb;
  last_seen_at: string | null;
  current_job_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PrintJobsRow = {
  id: string;
  printer_id: string;
  name: string;
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

export type PrinterCommandsRow = {
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

export type PrinterEventsRow = {
  id: string;
  printer_id: string;
  print_job_id: string | null;
  event_type: string;
  message: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

export type NotificationTypeDb = 'print_completed' | 'print_failed' | 'manual_intervention_required';

export type PrintJobNotificationsRow = {
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
      printers: {
        Row: PrintersRow;
        Insert: Partial<PrintersRow> & Pick<PrintersRow, 'name' | 'brand'>;
        Update: Partial<PrintersRow>;
        Relationships: [];
      };
      print_jobs: {
        Row: PrintJobsRow;
        Insert: Partial<PrintJobsRow> & Pick<PrintJobsRow, 'printer_id' | 'name' | 'created_by'>;
        Update: Partial<PrintJobsRow>;
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
      claim_next_printer_command: {
        Args: { p_printer_id: string; p_bridge_id: string };
        Returns: PrinterCommandsRow[];
      };
    };
  };
}
