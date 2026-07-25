-- Requeue: send an already-completed/failed/skipped/cancelled History job
-- back into the active queue as a brand-new job, without touching the
-- historical row at all (History must stay an immutable log).
--
-- create_print_job's "lock the printer, compute the next queue position,
-- insert the print_jobs row" logic is factored out into
-- insert_queued_print_job so requeue_print_job can reuse the exact same
-- queue-insertion primitive instead of duplicating it — the new row is
-- indistinguishable from one created by a fresh upload, so the bridge
-- picks it up with no special-case logic. See docs/architecture.md.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- insert_queued_print_job — shared primitive: lock printer, compute next
-- queue_position, insert the print_jobs row. Not granted to service_role
-- directly; only called from create_print_job / requeue_print_job below.
-- ---------------------------------------------------------------------------

create function insert_queued_print_job(
  p_id uuid,
  p_printer_id uuid,
  p_name text,
  p_original_filename text,
  p_storage_path text,
  p_file_size_bytes bigint,
  p_estimated_duration_seconds integer,
  p_notes text,
  p_created_by uuid
) returns print_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_position integer;
  v_job print_jobs;
begin
  perform id from printers where id = p_printer_id for update;

  select coalesce(max(queue_position), 0) + 1 into v_position
  from print_jobs
  where printer_id = p_printer_id and queue_position is not null;

  insert into print_jobs (
    id, printer_id, name, original_filename, storage_path, file_size_bytes,
    queue_position, status, estimated_duration_seconds, notes, created_by
  ) values (
    p_id, p_printer_id, p_name, p_original_filename, p_storage_path, p_file_size_bytes,
    v_position, 'queued', p_estimated_duration_seconds, p_notes, p_created_by
  )
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function insert_queued_print_job from public;

-- ---------------------------------------------------------------------------
-- create_print_job — now delegates row insertion to insert_queued_print_job.
-- Same signature/behavior as before; body only refactored.
-- ---------------------------------------------------------------------------

create or replace function create_print_job(
  p_id uuid,
  p_printer_id uuid,
  p_name text,
  p_original_filename text,
  p_storage_path text,
  p_file_size_bytes bigint,
  p_estimated_duration_seconds integer,
  p_notes text,
  p_created_by uuid,
  p_ams_slots jsonb
) returns print_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job print_jobs;
  v_slot jsonb;
begin
  v_job := insert_queued_print_job(
    p_id, p_printer_id, p_name, p_original_filename, p_storage_path,
    p_file_size_bytes, p_estimated_duration_seconds, p_notes, p_created_by
  );

  for v_slot in select * from jsonb_array_elements(p_ams_slots)
  loop
    insert into job_ams_slots (job_id, slot_number, is_used, color_name, material_name, notes)
    values (
      v_job.id,
      (v_slot ->> 'slot_number')::integer,
      (v_slot ->> 'is_used')::boolean,
      v_slot ->> 'color_name',
      v_slot ->> 'material_name',
      v_slot ->> 'notes'
    );
  end loop;

  return v_job;
end;
$$;

-- ---------------------------------------------------------------------------
-- requeue_print_job — copy a terminal job's printer/name/file/AMS slots into
-- a brand-new queued job via insert_queued_print_job. The source row is only
-- ever read, never written — History stays an immutable log.
-- ---------------------------------------------------------------------------

create function requeue_print_job(
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

  if v_source.status not in ('completed', 'failed', 'skipped', 'cancelled') then
    raise exception 'Only a completed, failed, skipped, or cancelled job can be requeued'
      using errcode = '22023';
  end if;

  v_job := insert_queued_print_job(
    p_new_id,
    v_source.printer_id,
    v_source.name,
    v_source.original_filename,
    v_source.storage_path,
    v_source.file_size_bytes,
    v_source.estimated_duration_seconds,
    v_source.notes,
    p_created_by
  );

  insert into job_ams_slots (job_id, slot_number, is_used, color_name, material_name, notes)
  select v_job.id, slot_number, is_used, color_name, material_name, notes
  from job_ams_slots
  where job_id = p_source_job_id;

  return v_job;
end;
$$;

revoke all on function requeue_print_job from public;
grant execute on function requeue_print_job to service_role;
