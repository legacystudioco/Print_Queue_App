-- Group / move / split jobs into plates.
--
-- The Job -> Plates hierarchy already exists (0018). A "standalone job" is
-- simply a jobs row with exactly one plate. This migration adds three RPCs
-- that reorganize existing jobs/plates without ever touching a plate's id,
-- screenshot_path, created_at, completed_at, status, notes, or
-- parent_plate_id — reassigning plates.job_id (and plate_name/sort_order)
-- is a MOVE, never a COPY, so history/timestamps/screenshots are preserved
-- for free. Each RPC is a single plpgsql function call, so a raised
-- exception rolls back the whole operation atomically, same as every RPC
-- in 0018.
--
-- Important trigger note: trg_plates_recompute_job_completed_at (0018)
-- only fires "after insert or update OF STATUS or delete on plates" — a
-- plain `update plates set job_id = ...` does NOT fire it. So every RPC
-- below that moves a plate between jobs must explicitly recompute
-- completed_at/queue_position for the affected job(s) itself.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- recompute_job_completed_at_for — the trigger body's "is this job fully
-- terminal" logic, factored out so it can also be called explicitly by RPCs
-- that move plates via a job_id-only UPDATE (which does not fire the
-- trigger). Same sticky, one-way semantics: only ever sets completed_at,
-- never clears it.
-- ---------------------------------------------------------------------------

create function recompute_job_completed_at_for(p_job_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_all_terminal boolean;
begin
  select not exists (
    select 1 from plates
    where job_id = p_job_id and status in ('queued', 'printing')
  ) into v_all_terminal;

  if v_all_terminal then
    update jobs
    set completed_at = coalesce(completed_at, now()),
        queue_position = null
    where id = p_job_id and completed_at is null;
  end if;
end;
$$;

revoke all on function recompute_job_completed_at_for from public;
grant execute on function recompute_job_completed_at_for to service_role;

create or replace function recompute_job_completed_at() returns trigger
language plpgsql
as $$
begin
  perform recompute_job_completed_at_for(coalesce(new.job_id, old.job_id));
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- group_jobs_into_new_job — create a new job and move each of the given
-- source jobs' single plate into it, in array order. Every source job must
-- currently have exactly one plate (hard invariant: only standalone jobs
-- can be grouped — mirrors the UI's "already-grouped plates should not
-- appear" rule, enforced here rather than trusted from the client). Source
-- jobs are deleted only after their plate has been moved out, so the
-- on-delete-cascade on plates.job_id never touches the plate being moved.
-- ---------------------------------------------------------------------------

create function group_jobs_into_new_job(
  p_new_job_id uuid,
  p_customer_name text,
  p_business business_name,
  p_notes text,
  p_created_by uuid,
  p_source_job_ids uuid[]
) returns jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_id uuid;
  v_source_name text;
  v_plate_count integer;
  v_position integer;
  v_ordinal integer := 0;
  v_all_terminal boolean;
  v_completed_at timestamptz;
  v_job jobs;
begin
  if p_source_job_ids is null or array_length(p_source_job_ids, 1) < 1 then
    raise exception 'At least one source job is required' using errcode = '22023';
  end if;

  -- Lock every source job up front and validate it's standalone (exactly
  -- one plate) before mutating anything.
  foreach v_source_id in array p_source_job_ids loop
    perform id from jobs where id = v_source_id for update;
    if not found then
      raise exception 'Source job % not found', v_source_id using errcode = 'P0002';
    end if;

    select count(*) into v_plate_count from plates where job_id = v_source_id;
    if v_plate_count <> 1 then
      raise exception 'Job % is not a standalone job (has % plates) and cannot be grouped', v_source_id, v_plate_count
        using errcode = '22023';
    end if;
  end loop;

  select not exists (
    select 1 from plates
    where job_id = any (p_source_job_ids) and status in ('queued', 'printing')
  ) into v_all_terminal;

  if v_all_terminal then
    select max(completed_at) into v_completed_at
    from plates where job_id = any (p_source_job_ids);
    v_completed_at := coalesce(v_completed_at, now());
    v_position := null;
  else
    v_completed_at := null;
    select coalesce(max(queue_position), 0) + 1 into v_position
    from jobs where business = p_business and queue_position is not null;
  end if;

  insert into jobs (id, customer_name, business, notes, queue_position, created_by, completed_at)
  values (p_new_job_id, p_customer_name, p_business, p_notes, v_position, p_created_by, v_completed_at)
  returning * into v_job;

  foreach v_source_id in array p_source_job_ids loop
    v_ordinal := v_ordinal + 1;
    select customer_name into v_source_name from jobs where id = v_source_id;

    update plates
    set job_id = p_new_job_id,
        plate_name = v_source_name,
        sort_order = v_ordinal
    where job_id = v_source_id;

    delete from jobs where id = v_source_id;
  end loop;

  return v_job;
end;
$$;

revoke all on function group_jobs_into_new_job from public;
grant execute on function group_jobs_into_new_job to service_role;

-- ---------------------------------------------------------------------------
-- move_job_into_job — move every plate from the source job into the target
-- job (appended after the target's current plates), preserving each
-- plate's existing plate_name (unlike group_jobs_into_new_job, this is an
-- ad hoc merge, not a fresh grouping). Deletes the now-empty source job.
-- ---------------------------------------------------------------------------

create function move_job_into_job(p_source_job_id uuid, p_target_job_id uuid) returns jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sort_order integer;
  v_job jobs;
begin
  if p_source_job_id = p_target_job_id then
    raise exception 'Cannot move a job into itself' using errcode = '22023';
  end if;

  perform id from jobs where id = p_source_job_id for update;
  if not found then
    raise exception 'Source job not found' using errcode = 'P0002';
  end if;

  perform id from jobs where id = p_target_job_id for update;
  if not found then
    raise exception 'Target job not found' using errcode = 'P0002';
  end if;

  select coalesce(max(sort_order), 0) into v_sort_order
  from plates where job_id = p_target_job_id;

  with ordered as (
    select id, row_number() over (order by sort_order) as rn
    from plates
    where job_id = p_source_job_id
  )
  update plates p
  set job_id = p_target_job_id,
      sort_order = v_sort_order + ordered.rn
  from ordered
  where p.id = ordered.id;

  delete from jobs where id = p_source_job_id;

  perform recompute_job_completed_at_for(p_target_job_id);

  select * into v_job from jobs where id = p_target_job_id;
  return v_job;
end;
$$;

revoke all on function move_job_into_job from public;
grant execute on function move_job_into_job to service_role;

-- ---------------------------------------------------------------------------
-- remove_plate_from_job — split one plate back out into its own standalone
-- job. Blocked when the plate is the only plate on its job (it's already
-- standalone) — mirrors the "can't delete the last plate" 409 precedent
-- enforced at the API layer for DELETE /api/plates/[id]. Business and
-- customer_name are derived automatically (from the old job and the
-- plate's own name) so this is a true one-click action.
-- ---------------------------------------------------------------------------

create function remove_plate_from_job(
  p_new_job_id uuid,
  p_plate_id uuid,
  p_created_by uuid
) returns jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plate plates;
  v_old_job_id uuid;
  v_old_business business_name;
  v_sibling_count integer;
  v_position integer;
  v_completed_at timestamptz;
  v_job jobs;
begin
  select * into v_plate from plates where id = p_plate_id for update;
  if v_plate.id is null then
    raise exception 'Plate not found' using errcode = 'P0002';
  end if;

  v_old_job_id := v_plate.job_id;
  perform id from jobs where id = v_old_job_id for update;

  select count(*) into v_sibling_count from plates where job_id = v_old_job_id;
  if v_sibling_count <= 1 then
    raise exception 'This is the only plate on its job — it is already standalone'
      using errcode = '22023';
  end if;

  select business into v_old_business from jobs where id = v_old_job_id;

  if v_plate.status in ('completed', 'partial') then
    v_completed_at := v_plate.completed_at;
    v_position := null;
  else
    v_completed_at := null;
    select coalesce(max(queue_position), 0) + 1 into v_position
    from jobs where business = v_old_business and queue_position is not null;
  end if;

  insert into jobs (id, customer_name, business, notes, queue_position, created_by, completed_at)
  values (p_new_job_id, v_plate.plate_name, v_old_business, null, v_position, p_created_by, v_completed_at)
  returning * into v_job;

  update plates
  set job_id = p_new_job_id,
      sort_order = 1
  where id = p_plate_id;

  perform recompute_job_completed_at_for(v_old_job_id);

  return v_job;
end;
$$;

revoke all on function remove_plate_from_job from public;
grant execute on function remove_plate_from_job to service_role;
