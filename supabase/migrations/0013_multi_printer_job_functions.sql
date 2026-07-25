-- Multi-printer support, step 3: job-creation/requeue/start-next functions
-- move from a single file per job to job_files, plus two new RPCs:
-- add_job_file ("Add Printer File" on an existing job) and
-- reassign_job_printer ("Move To" / steal-print).

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- insert_queued_print_job — drop the file columns; job_files now owns those.
-- ---------------------------------------------------------------------------

drop function create_print_job(uuid, uuid, text, text, text, bigint, integer, text, uuid, jsonb);
drop function insert_queued_print_job(uuid, uuid, text, text, text, bigint, integer, text, uuid);

create function insert_queued_print_job(
  p_id uuid,
  p_printer_id uuid,
  p_name text,
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
    id, printer_id, name, queue_position, status, estimated_duration_seconds, notes, created_by
  ) values (
    p_id, p_printer_id, p_name, v_position, 'queued', p_estimated_duration_seconds, p_notes, p_created_by
  )
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function insert_queued_print_job from public;

-- ---------------------------------------------------------------------------
-- create_print_job — now takes an array of per-brand files instead of a
-- single filename/storage_path/file_size_bytes. AMS slots are only inserted
-- when actually provided (a Snapmaker/Flashforge-only job has none).
-- ---------------------------------------------------------------------------

create function create_print_job(
  p_id uuid,
  p_printer_id uuid,
  p_name text,
  p_estimated_duration_seconds integer,
  p_notes text,
  p_created_by uuid,
  p_files jsonb,
  p_ams_slots jsonb
) returns print_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job print_jobs;
  v_file jsonb;
  v_slot jsonb;
begin
  v_job := insert_queued_print_job(
    p_id, p_printer_id, p_name, p_estimated_duration_seconds, p_notes, p_created_by
  );

  for v_file in select * from jsonb_array_elements(p_files)
  loop
    insert into job_files (job_id, printer_brand, filename, storage_path, file_size_bytes)
    values (
      v_job.id,
      (v_file ->> 'printer_brand')::printer_brand,
      v_file ->> 'filename',
      v_file ->> 'storage_path',
      (v_file ->> 'file_size_bytes')::bigint
    );
  end loop;

  if p_ams_slots is not null and jsonb_array_length(p_ams_slots) > 0 then
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
  end if;

  return v_job;
end;
$$;

revoke all on function create_print_job from public;
grant execute on function create_print_job to service_role;

-- ---------------------------------------------------------------------------
-- requeue_print_job — copy ALL of the source job's job_files rows (every
-- brand it had), not just one. Signature is unchanged.
-- ---------------------------------------------------------------------------

create or replace function requeue_print_job(
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
    v_source.estimated_duration_seconds,
    v_source.notes,
    p_created_by
  );

  insert into job_files (job_id, printer_brand, filename, storage_path, file_size_bytes)
  select v_job.id, printer_brand, filename, storage_path, file_size_bytes
  from job_files
  where job_id = p_source_job_id;

  insert into job_ams_slots (job_id, slot_number, is_used, color_name, material_name, notes)
  select v_job.id, slot_number, is_used, color_name, material_name, notes
  from job_ams_slots
  where job_id = p_source_job_id;

  return v_job;
end;
$$;

-- ---------------------------------------------------------------------------
-- start_next_print — resolve the file to send via job_files, joined on the
-- assigned printer's brand, instead of reading print_jobs directly. Signature
-- is unchanged; the printer_commands payload shape is unchanged.
-- ---------------------------------------------------------------------------

create or replace function start_next_print(
  p_job_id uuid,
  p_printer_id uuid,
  p_requested_by uuid,
  p_idempotency_key text,
  p_previous_print_removed boolean,
  p_build_plate_clear boolean,
  p_ams_verified boolean
) returns printer_commands
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing printer_commands;
  v_next_job_id uuid;
  v_job print_jobs;
  v_active_count integer;
  v_open_command_count integer;
  v_command printer_commands;
  v_storage_path text;
  v_filename text;
begin
  -- Idempotent replay: a duplicate submit with the same client-generated key
  -- returns the command already created for it instead of erroring.
  select * into v_existing from printer_commands where idempotency_key = p_idempotency_key;
  if found then
    return v_existing;
  end if;

  perform id from printers where id = p_printer_id for update;

  select count(*) into v_active_count
  from print_jobs
  where printer_id = p_printer_id
    and status in ('command_pending', 'downloading', 'uploading_to_printer', 'starting', 'printing');

  if v_active_count > 0 then
    raise exception 'A print is already active on this printer' using errcode = '22023';
  end if;

  select count(*) into v_open_command_count
  from printer_commands
  where printer_id = p_printer_id and status in ('pending', 'claimed', 'processing');

  if v_open_command_count > 0 then
    raise exception 'A printer command is already in flight' using errcode = '22023';
  end if;

  select id into v_next_job_id
  from print_jobs
  where printer_id = p_printer_id and status in ('queued', 'ready')
  order by queue_position asc
  limit 1
  for update;

  if v_next_job_id is null or v_next_job_id <> p_job_id then
    raise exception 'This job is no longer the next job in the queue' using errcode = '22023';
  end if;

  select * into v_job from print_jobs where id = p_job_id;

  select jf.storage_path, jf.filename into v_storage_path, v_filename
  from job_files jf
  join printers pr on pr.id = p_printer_id
  where jf.job_id = p_job_id and jf.printer_brand = pr.brand;

  if v_storage_path is null then
    raise exception 'No uploaded file on this job for printer %''s brand', p_printer_id
      using errcode = '22023';
  end if;

  insert into bed_clear_confirmations (
    print_job_id, confirmed_by, previous_print_removed, build_plate_clear, ams_verified
  ) values (
    p_job_id, p_requested_by, p_previous_print_removed, p_build_plate_clear, p_ams_verified
  );

  insert into printer_commands (
    printer_id, print_job_id, command_type, status, requested_by, idempotency_key, payload
  ) values (
    p_printer_id,
    p_job_id,
    'start_print',
    'pending',
    p_requested_by,
    p_idempotency_key,
    jsonb_build_object(
      'jobId', p_job_id,
      'storagePath', v_storage_path,
      'originalFilename', v_filename
    )
  )
  returning * into v_command;

  update print_jobs set status = 'command_pending' where id = p_job_id;

  return v_command;
end;
$$;

-- ---------------------------------------------------------------------------
-- add_job_file — "Add Printer File": attach (or replace) a brand's file on
-- an existing job, without creating a new job.
-- ---------------------------------------------------------------------------

create function add_job_file(
  p_job_id uuid,
  p_printer_brand printer_brand,
  p_filename text,
  p_storage_path text,
  p_file_size_bytes bigint
) returns job_files
language plpgsql
security definer
set search_path = public
as $$
declare
  v_file job_files;
begin
  perform id from print_jobs where id = p_job_id for update;

  if not found then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;

  insert into job_files (job_id, printer_brand, filename, storage_path, file_size_bytes)
  values (p_job_id, p_printer_brand, p_filename, p_storage_path, p_file_size_bytes)
  on conflict (job_id, printer_brand)
  do update set filename = excluded.filename,
                storage_path = excluded.storage_path,
                file_size_bytes = excluded.file_size_bytes
  returning * into v_file;

  -- Rides the existing print_jobs Realtime subscription — no separate
  -- job_files publication/channel needed.
  update print_jobs set updated_at = now() where id = p_job_id;

  return v_file;
end;
$$;

revoke all on function add_job_file from public;
grant execute on function add_job_file to service_role;

-- ---------------------------------------------------------------------------
-- reassign_job_printer — "Move To" / steal-print: move a not-yet-started job
-- to a different physical printer, as long as that printer's brand has a
-- matching uploaded file on the job. No file conversion or re-upload — same
-- job_files row, just a different printer_id going forward.
-- ---------------------------------------------------------------------------

create function reassign_job_printer(
  p_job_id uuid,
  p_new_printer_id uuid
) returns print_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status print_job_status;
  v_old_printer_id uuid;
  v_new_brand printer_brand;
  v_position integer;
  v_job print_jobs;
begin
  select status, printer_id into v_status, v_old_printer_id
  from print_jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;

  if v_status not in ('queued', 'ready') then
    raise exception 'Job has already started printing and cannot be reassigned'
      using errcode = '22023';
  end if;

  -- Lock both printer rows in a stable order to avoid deadlocking against a
  -- concurrent reassignment/start-next touching the other printer.
  perform id from printers
  where id in (v_old_printer_id, p_new_printer_id)
  order by id
  for update;

  select brand into v_new_brand from printers where id = p_new_printer_id;

  if v_new_brand is null then
    raise exception 'Target printer not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from job_files where job_id = p_job_id and printer_brand = v_new_brand
  ) then
    raise exception 'No uploaded file for the target printer''s brand'
      using errcode = '22023';
  end if;

  select coalesce(max(queue_position), 0) + 1 into v_position
  from print_jobs
  where printer_id = p_new_printer_id and queue_position is not null;

  update print_jobs
  set printer_id = p_new_printer_id, queue_position = v_position
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function reassign_job_printer from public;
grant execute on function reassign_job_printer to service_role;
