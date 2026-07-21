-- Atomic, transactional business-logic functions.
--
-- All of these are SECURITY DEFINER and granted only to service_role — they
-- are called exclusively from trusted Next.js route handlers and the bridge
-- service, both of which use the Supabase service-role key. Authorization
-- (who is allowed to call the route at all) happens in application code
-- before these are invoked; these functions are responsible for the
-- concurrency-safety and data-integrity invariants that must hold no matter
-- how many requests arrive at once.
--
-- Every function that touches queue_position or the "is anything already
-- active" invariant starts by locking the parent printers row
-- (`select ... for update`), which serializes all such operations per
-- printer. For a single-printer household app this is simple and correct;
-- it would need revisiting for a multi-printer deployment with high write
-- concurrency.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- create_print_job — insert a job at the end of the queue plus its 4 AMS slots
-- ---------------------------------------------------------------------------

create function create_print_job(
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
  v_position integer;
  v_job print_jobs;
  v_slot jsonb;
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

  for v_slot in select * from jsonb_array_elements(p_ams_slots)
  loop
    insert into job_ams_slots (job_id, slot_number, is_used, color_name, material_name, notes)
    values (
      p_id,
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

revoke all on function create_print_job from public;
grant execute on function create_print_job to service_role;

-- ---------------------------------------------------------------------------
-- reorder_queue — atomically renumber queue_position for the active queue
-- ---------------------------------------------------------------------------

create function reorder_queue(p_printer_id uuid, p_ordered_job_ids uuid[]) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current uuid[];
  v_requested uuid[];
begin
  perform id from printers where id = p_printer_id for update;

  select coalesce(array_agg(id order by id), '{}') into v_current
  from print_jobs
  where printer_id = p_printer_id and status in ('queued', 'ready');

  select coalesce(array_agg(x order by x), '{}') into v_requested
  from unnest(p_ordered_job_ids) as x;

  if v_current <> v_requested then
    raise exception 'Ordered job list does not match the current active queue'
      using errcode = '22023';
  end if;

  -- Two-phase update avoids violating the partial unique index on
  -- (printer_id, queue_position) when positions shift around.
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

revoke all on function reorder_queue from public;
grant execute on function reorder_queue to service_role;

-- ---------------------------------------------------------------------------
-- retry_print_job — failed -> queued, appended to the end of the queue
-- ---------------------------------------------------------------------------

create function retry_print_job(p_job_id uuid) returns print_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_printer_id uuid;
  v_position integer;
  v_job print_jobs;
begin
  select printer_id into v_printer_id from print_jobs where id = p_job_id for update;

  if v_printer_id is null then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;

  perform id from printers where id = v_printer_id for update;

  select coalesce(max(queue_position), 0) + 1 into v_position
  from print_jobs
  where printer_id = v_printer_id and queue_position is not null;

  update print_jobs
  set status = 'queued', queue_position = v_position, failure_message = null
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function retry_print_job from public;
grant execute on function retry_print_job to service_role;

-- ---------------------------------------------------------------------------
-- start_next_print — the safety-critical entry point for "Start Next Print"
-- ---------------------------------------------------------------------------

create function start_next_print(
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
      'storagePath', v_job.storage_path,
      'originalFilename', v_job.original_filename
    )
  )
  returning * into v_command;

  update print_jobs set status = 'command_pending' where id = p_job_id;

  return v_command;
end;
$$;

revoke all on function start_next_print from public;
grant execute on function start_next_print to service_role;

-- ---------------------------------------------------------------------------
-- claim_next_printer_command — atomic claim used by the home bridge
-- ---------------------------------------------------------------------------

create function claim_next_printer_command(p_printer_id uuid, p_bridge_id text)
returns setof printer_commands
language plpgsql
security definer
set search_path = public
as $$
declare
  v_command printer_commands;
begin
  select * into v_command
  from printer_commands
  where printer_id = p_printer_id and status = 'pending'
  order by requested_at asc
  limit 1
  for update skip locked;

  if not found then
    return;
  end if;

  update printer_commands
  set status = 'claimed',
      claimed_at = now(),
      claimed_by_bridge = p_bridge_id,
      attempt_count = attempt_count + 1
  where id = v_command.id
  returning * into v_command;

  return next v_command;
end;
$$;

revoke all on function claim_next_printer_command from public;
grant execute on function claim_next_printer_command to service_role;
