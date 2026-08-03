-- Product pivot: printer automation -> visual production board.
--
-- The app no longer sends files to printers or drives them via the bridge —
-- printing happens manually, by hand, from the user's own computer. This app
-- is now a 2-column Kanban tracking WHAT needs to be printed, keyed to a
-- business ("3D Sports Displays" / "Dougie-Doug") rather than a physical
-- printer, built around a screenshot of the build plate.
--
-- Nothing from the printer-automation era is dropped: printers,
-- printer_commands, printer_events, bed_clear_confirmations, job_ams_slots,
-- job_files, the print_job_status enum + its transition trigger, and every
-- RPC built for them (create_print_job, reorder_queue, reassign_job_printer,
-- start_next_print, claim_next_printer_command, add_job_file,
-- retry_print_job, requeue_print_job) are left fully intact so the bridge
-- (apps/bridge, archived not deleted) can be restored later without a data
-- migration. print_jobs.printer_id simply stops being mandatory, and this
-- migration adds the columns/enums/functions the new board actually uses.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- New enums
-- ---------------------------------------------------------------------------

create type business_name as enum ('3d_sports_displays', 'dougie_doug');

comment on type business_name is
  'The two businesses the production board tracks work for. Exactly two by '
  'product decision — add a third with ALTER TYPE ... ADD VALUE if needed.';

create type job_board_status as enum ('queued', 'printing', 'partial', 'completed');

comment on type job_board_status is
  'Lifecycle of a job on the production board. Deliberately much simpler '
  'than print_job_status (which models the old bridge upload/start '
  'pipeline and is left untouched for archival purposes). Legal edges: '
  'queued -> printing -> completed, or printing -> partial (terminal, see '
  'create_partial_reprint for the follow-up-job workflow).';

-- ---------------------------------------------------------------------------
-- print_jobs: printer assignment becomes optional, board columns added
-- ---------------------------------------------------------------------------

alter table print_jobs alter column printer_id drop not null;

alter table print_jobs
  add column business business_name,
  add column screenshot_path text,
  add column colors text,
  add column board_status job_board_status,
  add column parent_job_id uuid references print_jobs (id) on delete set null;

comment on column print_jobs.screenshot_path is
  'Path within the job-screenshots storage bucket of the build-plate photo '
  '— the primary visual reference for the job. Resolved to a signed URL by '
  'the app, same pattern as the old print-files bucket.';

comment on column print_jobs.parent_job_id is
  'Set when this job is a reprint created from a Partial job (see '
  'create_partial_reprint) — points at the original job whose plate '
  'partially failed. NULL for every job that is not a reprint.';

-- Backfill existing rows. There is no real historical business mapping, so
-- every pre-existing job defaults to '3d_sports_displays' — reassignable by
-- drag-and-drop on the board after this migration runs. board_status is
-- derived from the best-effort mapping of the old bridge-pipeline status.
update print_jobs
set business = '3d_sports_displays'
where business is null;

update print_jobs
set board_status = case
  when status = 'printing' then 'printing'
  when status = 'completed' then 'completed'
  when status in ('failed', 'skipped', 'cancelled') then 'completed'
  else 'queued'
end::job_board_status
where board_status is null;

alter table print_jobs
  alter column business set not null,
  alter column board_status set not null;

-- Only one job may occupy a given queue position per business — mirrors
-- uq_print_jobs_printer_queue_position (0002) for the new board-column key.
create unique index uq_print_jobs_business_queue_position
  on print_jobs (business, queue_position)
  where queue_position is not null;

create index idx_print_jobs_business on print_jobs (business);
create index idx_print_jobs_board_status on print_jobs (board_status);
create index idx_print_jobs_parent_job_id on print_jobs (parent_job_id) where parent_job_id is not null;

-- ---------------------------------------------------------------------------
-- board_status transition enforcement — same idiom as
-- can_transition_print_job_status / enforce_print_job_status_transition
-- (0003, patched in 0015), scoped to board_status instead of status.
-- ---------------------------------------------------------------------------

create function can_transition_board_status(p_from job_board_status, p_to job_board_status)
returns boolean
language sql
immutable
as $$
  select case p_from
    when 'queued' then p_to = 'printing'
    when 'printing' then p_to in ('completed', 'partial')
    when 'partial' then false
    when 'completed' then false
    else false
  end;
$$;

create function enforce_board_status_transition() returns trigger
language plpgsql
as $$
begin
  if new.board_status is distinct from old.board_status then
    if not can_transition_board_status(old.board_status, new.board_status) then
      raise exception 'Illegal job board status transition: "%" -> "%"', old.board_status, new.board_status
        using errcode = '22023';
    end if;

    if new.board_status = 'completed' then
      new.queue_position := null;
      new.completed_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_print_jobs_enforce_board_status_transition
  before update on print_jobs
  for each row execute function enforce_board_status_transition();

-- ---------------------------------------------------------------------------
-- create_board_job — insert a job at the end of its business's queue.
-- ---------------------------------------------------------------------------

create function create_board_job(
  p_id uuid,
  p_name text,
  p_business business_name,
  p_screenshot_path text,
  p_colors text,
  p_estimated_duration_seconds integer,
  p_notes text,
  p_created_by uuid,
  p_parent_job_id uuid default null
) returns print_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_position integer;
  v_job print_jobs;
begin
  select coalesce(max(queue_position), 0) + 1 into v_position
  from print_jobs
  where business = p_business and queue_position is not null;

  insert into print_jobs (
    id, printer_id, name, business, screenshot_path, colors, queue_position,
    status, board_status, estimated_duration_seconds, notes, created_by, parent_job_id
  ) values (
    p_id, null, p_name, p_business, p_screenshot_path, p_colors, v_position,
    'uploaded', 'queued', p_estimated_duration_seconds, p_notes, p_created_by, p_parent_job_id
  )
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function create_board_job from public;
grant execute on function create_board_job to service_role;

-- ---------------------------------------------------------------------------
-- reorder_board_queue — atomically renumber queue_position within a business.
-- Same two-phase null-then-renumber approach as reorder_queue (0004).
-- ---------------------------------------------------------------------------

create function reorder_board_queue(p_business business_name, p_ordered_job_ids uuid[]) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current uuid[];
  v_requested uuid[];
begin
  select coalesce(array_agg(id order by id), '{}') into v_current
  from print_jobs
  where business = p_business and board_status <> 'completed' and board_status <> 'partial';

  select coalesce(array_agg(x order by x), '{}') into v_requested
  from unnest(p_ordered_job_ids) as x;

  if v_current <> v_requested then
    raise exception 'Ordered job list does not match the current active queue for this business'
      using errcode = '22023';
  end if;

  update print_jobs set queue_position = null
  where id = any (p_ordered_job_ids);

  update print_jobs pj
  set queue_position = t.pos
  from (
    select id, ordinality::integer as pos
    from unnest(p_ordered_job_ids) with ordinality as u (id, ordinality)
  ) t
  where pj.id = t.id;
end;
$$;

revoke all on function reorder_board_queue from public;
grant execute on function reorder_board_queue to service_role;

-- ---------------------------------------------------------------------------
-- move_job_to_business — drag a card to the other column: reassign business,
-- append at the end of the destination business's queue.
-- ---------------------------------------------------------------------------

create function move_job_to_business(p_job_id uuid, p_new_business business_name) returns print_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_position integer;
  v_job print_jobs;
begin
  perform id from print_jobs where id = p_job_id for update;

  if not found then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;

  select coalesce(max(queue_position), 0) + 1 into v_position
  from print_jobs
  where business = p_new_business and queue_position is not null;

  update print_jobs
  set business = p_new_business,
      queue_position = case when queue_position is not null then v_position else queue_position end
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function move_job_to_business from public;
grant execute on function move_job_to_business to service_role;

-- ---------------------------------------------------------------------------
-- set_job_board_status — "Start Printing" / "Complete" / "Partial". The
-- trigger above enforces legality and handles completed_at/queue_position.
-- ---------------------------------------------------------------------------

create function set_job_board_status(p_job_id uuid, p_new_status job_board_status) returns print_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job print_jobs;
begin
  update print_jobs
  set board_status = p_new_status
  where id = p_job_id
  returning * into v_job;

  if v_job.id is null then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;

  return v_job;
end;
$$;

revoke all on function set_job_board_status from public;
grant execute on function set_job_board_status to service_role;

-- ---------------------------------------------------------------------------
-- create_partial_reprint — the follow-up job created after a Partial print.
-- Requires the source job to already be marked 'partial' (via
-- set_job_board_status) — this function only creates the linked child.
-- ---------------------------------------------------------------------------

create function create_partial_reprint(
  p_new_id uuid,
  p_source_job_id uuid,
  p_screenshot_path text,
  p_created_by uuid
) returns print_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source print_jobs;
  v_job print_jobs;
begin
  select * into v_source from print_jobs where id = p_source_job_id;

  if v_source.id is null then
    raise exception 'Source job not found' using errcode = 'P0002';
  end if;

  if v_source.board_status <> 'partial' then
    raise exception 'Only a job marked Partial can have a reprint created from it'
      using errcode = '22023';
  end if;

  v_job := create_board_job(
    p_new_id,
    v_source.name || ' - Reprint',
    v_source.business,
    p_screenshot_path,
    v_source.colors,
    v_source.estimated_duration_seconds,
    v_source.notes,
    p_created_by,
    p_source_job_id
  );

  return v_job;
end;
$$;

revoke all on function create_partial_reprint from public;
grant execute on function create_partial_reprint to service_role;

-- ---------------------------------------------------------------------------
-- requeue_board_job — generalized version of requeue_print_job (0009/0013):
-- copy a terminal job's board fields into a fresh queued job. No
-- parent_job_id — this is a manual re-run, not a partial-reprint lineage
-- link (use create_partial_reprint for that).
-- ---------------------------------------------------------------------------

create function requeue_board_job(
  p_new_id uuid,
  p_source_job_id uuid,
  p_created_by uuid
) returns print_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source print_jobs;
  v_job print_jobs;
begin
  select * into v_source from print_jobs where id = p_source_job_id;

  if v_source.id is null then
    raise exception 'Source job not found' using errcode = 'P0002';
  end if;

  if v_source.board_status not in ('completed', 'partial') then
    raise exception 'Only a completed or partial job can be requeued' using errcode = '22023';
  end if;

  v_job := create_board_job(
    p_new_id,
    v_source.name,
    v_source.business,
    v_source.screenshot_path,
    v_source.colors,
    v_source.estimated_duration_seconds,
    v_source.notes,
    p_created_by
  );

  return v_job;
end;
$$;

revoke all on function requeue_board_job from public;
grant execute on function requeue_board_job to service_role;

-- ---------------------------------------------------------------------------
-- job-screenshots storage bucket — same private + admin-write/all-read
-- pattern as the print-files bucket (0006).
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('job-screenshots', 'job-screenshots', false)
on conflict (id) do nothing;

create policy "active users can view job screenshots"
  on storage.objects for select
  using (bucket_id = 'job-screenshots' and is_active_app_user());

create policy "admins can upload job screenshots"
  on storage.objects for insert
  with check (bucket_id = 'job-screenshots' and current_app_role() = 'admin');

create policy "admins can update job screenshots"
  on storage.objects for update
  using (bucket_id = 'job-screenshots' and current_app_role() = 'admin');

create policy "admins can delete job screenshots"
  on storage.objects for delete
  using (bucket_id = 'job-screenshots' and current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- Notifications: add the four new board event types alongside the old
-- (archived) bridge ones. Values added here cannot be referenced by any
-- statement in this same migration transaction — only by later ones.
-- ---------------------------------------------------------------------------

alter type notification_type add value if not exists 'job_completed';
alter type notification_type add value if not exists 'partial_created';
alter type notification_type add value if not exists 'job_moved';
alter type notification_type add value if not exists 'queue_summary';

-- A board event has no printer behind it.
alter table print_job_notifications alter column printer_id drop not null;

-- The original (print_job_id, notification_type) unique constraint exists
-- for bridge retry-safety (a duplicate MQTT completion report is a no-op,
-- not a duplicate notification) — it does not fit the board's job_moved
-- event, which can legitimately fire more than once for the same job (a
-- card can be dragged back and forth before it starts printing). Replace
-- it with a partial unique index that keeps the old dedup guarantee only
-- for the archived bridge notification types; the new board event types
-- (job_completed, partial_created, job_moved, queue_summary) get a fresh
-- row per event and are not deduplicated at the database level.
alter table print_job_notifications
  drop constraint print_job_notifications_print_job_id_notification_type_key;

create unique index uq_print_job_notifications_bridge_dedup
  on print_job_notifications (print_job_id, notification_type)
  where notification_type in ('print_completed', 'print_failed', 'manual_intervention_required');

alter table notification_preferences
  add column notify_on_job_completed boolean not null default true,
  add column notify_on_partial_created boolean not null default true,
  add column notify_on_job_moved boolean not null default false,
  add column notify_on_queue_summary boolean not null default false;

comment on table notification_preferences is
  'One row per user. notify_on_job_completed / notify_on_partial_created / '
  'notify_on_job_moved / notify_on_queue_summary drive the production '
  'board''s notifications (see lib/server/notifications.ts). The three '
  'notify_on_print_* columns are archived leftovers from the printer-'
  'automation era and are no longer read by the app. A missing row is '
  'treated as the column defaults (see @print-queue/shared '
  'DEFAULT_NOTIFICATION_PREFERENCES) — the app upserts a row the first '
  'time a user opens notification settings rather than requiring one to '
  'exist upfront.';
