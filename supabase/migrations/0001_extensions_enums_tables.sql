-- Print Queue App — core schema
-- Extensions, enums, and tables. See docs/architecture.md for the full data model.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type user_role as enum ('admin', 'operator');

create type printer_status as enum (
  'online',
  'offline',
  'idle',
  'preparing',
  'printing',
  'paused',
  'completed',
  'failed',
  'unknown'
);

create type print_job_status as enum (
  'uploaded',
  'queued',
  'ready',
  'command_pending',
  'downloading',
  'uploading_to_printer',
  'starting',
  'printing',
  'completed',
  'failed',
  'skipped',
  'cancelled'
);

create type printer_command_type as enum (
  'start_print',
  'refresh_status',
  'cancel_print',
  'pause_print',
  'resume_print'
);

create type printer_command_status as enum (
  'pending',
  'claimed',
  'processing',
  'completed',
  'failed',
  'cancelled'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table app_users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  role user_role not null default 'operator',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table app_users is
  'Allow-listed application users. A row here (with active = true) is required '
  'for a Supabase Auth user to access any application data — see RLS policies.';

create table printers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  model text not null default 'Bambu Lab P1S',
  serial_number text,
  local_ip text,
  bridge_id text,
  status printer_status not null default 'unknown',
  last_seen_at timestamptz,
  current_job_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table printers is
  'Physical printers. This app targets exactly one, but the schema does not '
  'hard-code that assumption. Sensitive credentials (access code) live only '
  'in the bridge''s environment variables, never in this table.';

create table print_jobs (
  id uuid primary key default gen_random_uuid(),
  printer_id uuid not null references printers (id) on delete cascade,
  name text not null,
  original_filename text not null,
  storage_path text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  queue_position integer,
  status print_job_status not null default 'uploaded',
  estimated_duration_seconds integer check (estimated_duration_seconds is null or estimated_duration_seconds > 0),
  notes text,
  created_by uuid not null references app_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  failure_message text
);

comment on column print_jobs.queue_position is
  'Position within the active queue for this printer. NULL once the job '
  'leaves the active queue (completed/failed/skipped/cancelled), freeing '
  'the slot. Uniqueness enforced by a partial index — see migration 0002.';

alter table printers
  add constraint printers_current_job_id_fkey
  foreign key (current_job_id) references print_jobs (id) on delete set null;

create table job_ams_slots (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references print_jobs (id) on delete cascade,
  slot_number integer not null check (slot_number between 1 and 4),
  color_name text,
  material_name text,
  notes text,
  is_used boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, slot_number)
);

create table printer_commands (
  id uuid primary key default gen_random_uuid(),
  printer_id uuid not null references printers (id) on delete cascade,
  print_job_id uuid references print_jobs (id) on delete set null,
  command_type printer_command_type not null,
  status printer_command_status not null default 'pending',
  requested_by uuid not null references app_users (id),
  requested_at timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_by_bridge text,
  completed_at timestamptz,
  error_message text,
  attempt_count integer not null default 0,
  idempotency_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  result jsonb
);

create table printer_events (
  id uuid primary key default gen_random_uuid(),
  printer_id uuid not null references printers (id) on delete cascade,
  print_job_id uuid references print_jobs (id) on delete set null,
  event_type text not null,
  message text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table bed_clear_confirmations (
  id uuid primary key default gen_random_uuid(),
  print_job_id uuid not null references print_jobs (id) on delete cascade,
  confirmed_by uuid not null references app_users (id),
  previous_print_removed boolean not null,
  build_plate_clear boolean not null,
  ams_verified boolean not null,
  created_at timestamptz not null default now()
);
