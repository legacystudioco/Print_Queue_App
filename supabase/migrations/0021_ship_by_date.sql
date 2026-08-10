-- Ship By date: an optional calendar shipping deadline on the parent
-- job/order (never per-plate, never on job_templates — a deadline is
-- order-specific, not part of a reusable recipe). Plain `date`, not
-- `timestamptz` — this represents a calendar day, not a precise instant, and
-- must never be converted through UTC in a way that could shift the
-- displayed day (see packages/shared/src/shipDate.ts, which works on the
-- "YYYY-MM-DD" string's y/m/d components directly rather than `new
-- Date(dateOnlyString)`).

set check_function_bodies = off;

alter table jobs add column ship_by_date date;

comment on column jobs.ship_by_date is
  'Optional calendar shipping deadline for this customer/order, set at '
  'job creation, "Create Job from Template", or Edit Job. NULL = none. '
  'Never copied onto job_templates/job_template_plates. Never touched by '
  'plate-level operations (add_plate_to_job, duplicate_plate, '
  'create_plate_reprint, set_plate_status) or move_job_into_job — all '
  'leave the parent job''s existing value untouched by construction, since '
  'none of them write to this column. group_jobs_into_new_job inherits the '
  'EARLIEST non-null value among the jobs being merged (see that function '
  'below). remove_plate_from_job''s newly split-off standalone job '
  'intentionally starts NULL — its insert does not reference this column, '
  'since a single split-off plate has no natural deadline to inherit.';

-- ---------------------------------------------------------------------------
-- create_job_with_plates — adding a parameter changes the signature, so
-- drop + recreate rather than create-or-replace (which would otherwise
-- leave the old 6-arg version as a stale overload). Used by both plain job
-- creation (POST /api/jobs) and "Create Job from Template"
-- (POST /api/templates/[id]/jobs) — same RPC either way.
-- ---------------------------------------------------------------------------

drop function if exists create_job_with_plates(uuid, text, business_name, text, uuid, jsonb);

create function create_job_with_plates(
  p_job_id uuid,
  p_customer_name text,
  p_business business_name,
  p_notes text,
  p_created_by uuid,
  p_plates jsonb,
  p_ship_by_date date default null
) returns jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_position integer;
  v_job jobs;
begin
  if p_plates is null or jsonb_array_length(p_plates) < 1 then
    raise exception 'At least one plate is required' using errcode = '22023';
  end if;

  select coalesce(max(queue_position), 0) + 1 into v_position
  from jobs
  where business = p_business and queue_position is not null;

  insert into jobs (id, customer_name, business, notes, queue_position, created_by, ship_by_date)
  values (p_job_id, p_customer_name, p_business, p_notes, v_position, p_created_by, p_ship_by_date)
  returning * into v_job;

  insert into plates (
    id, job_id, plate_name, screenshot_path, colors, estimated_duration_seconds, notes, sort_order
  )
  select
    coalesce((elem->>'id')::uuid, gen_random_uuid()),
    p_job_id,
    elem->>'plateName',
    elem->>'screenshotPath',
    elem->>'colors',
    nullif(elem->>'estimatedDurationSeconds', '')::integer,
    elem->>'notes',
    ord::integer
  from jsonb_array_elements(p_plates) with ordinality as t(elem, ord);

  return v_job;
end;
$$;

revoke all on function create_job_with_plates from public;
grant execute on function create_job_with_plates to service_role;

-- ---------------------------------------------------------------------------
-- group_jobs_into_new_job — same signature (create or replace is safe
-- here), body now computes the new job's ship_by_date as the EARLIEST
-- non-null value among the standalone jobs being merged (min() over a
-- nullable date column ignores nulls, and returns null if every source is
-- null) — confirmed product decision: never silently miss the tightest
-- deadline when merging orders. See migration header comment.
-- ---------------------------------------------------------------------------

create or replace function group_jobs_into_new_job(
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
  v_ship_by_date date;
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

  select min(ship_by_date) into v_ship_by_date from jobs where id = any (p_source_job_ids);

  insert into jobs (id, customer_name, business, notes, queue_position, created_by, completed_at, ship_by_date)
  values (p_new_job_id, p_customer_name, p_business, p_notes, v_position, p_created_by, v_completed_at, v_ship_by_date)
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
