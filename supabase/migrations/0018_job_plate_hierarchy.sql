-- Job/Plate hierarchy: one board card per customer/order, many plates each.
--
-- The board today treats every physical build plate as its own top-level
-- print_jobs row/card. In practice one customer order produces several
-- plates, so this migration introduces a real two-level hierarchy:
--
--   jobs (the customer/order) -> plates (the individual build-plate items)
--
-- Nothing from print_jobs or the printer-automation era is dropped or
-- altered beyond what's needed here — same "archive, don't delete"
-- convention 0017 established. print_jobs becomes a read-only historical
-- record; every row is copied 1:1 into a new jobs row + one plates row by
-- the data migration at the bottom of this file, preserving screenshot,
-- colors, estimated time, notes, status, and partial-reprint lineage
-- (parent_job_id -> parent_plate_id).
--
-- Key semantics (see plan / product decisions for the full rationale):
--   - status / total_plate_count / completed_plate_count are NEVER stored
--     — always derived from a job's plates, in packages/shared TS.
--   - jobs.completed_at is a *stored*, one-way stamp: set once by a
--     trigger the first time every plate under a job reaches a terminal
--     state (completed/partial), and never cleared automatically after
--     that — it is what separates "on the Board" (completed_at is null)
--     from "in History" (completed_at is not null). Adding a new plate to
--     an already-archived job does NOT move it back to the Board.
--   - Deleting the last remaining plate of a job is blocked at the API
--     layer (see apps/web), not the database — a job can never be left
--     with 0 plates by product decision, but nothing here enforces it.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- jobs — the customer/order.
-- ---------------------------------------------------------------------------

create table jobs (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  business business_name not null,
  notes text,
  queue_position integer,
  created_by uuid not null references app_users (id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

comment on table jobs is
  'A customer/order. Contains one or more plates (see table plates). '
  'status / total_plate_count / completed_plate_count are deliberately not '
  'columns here — always derived from the job''s plates in '
  '@print-queue/shared (see packages/shared/src/board.ts deriveJobStatus).';

comment on column jobs.completed_at is
  'Sticky, one-way stamp set by trg_plates_recompute_job_completed_at the '
  'first time every plate under this job reaches a terminal state '
  '(completed/partial). NULL = on the Board. Not null = in History. Never '
  'cleared automatically, even if a new (queued) plate is added later — '
  'see migration 0018 header comment.';

comment on column jobs.queue_position is
  'Position within the active queue for this job''s business. NULL once '
  'completed_at is set. Uniqueness enforced by a partial index below.';

create unique index uq_jobs_business_queue_position
  on jobs (business, queue_position)
  where queue_position is not null;

create index idx_jobs_business on jobs (business);

-- ---------------------------------------------------------------------------
-- plates — the individual build-plate item belonging to a job.
-- ---------------------------------------------------------------------------

create table plates (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id) on delete cascade,
  plate_name text not null,
  screenshot_path text,
  colors text,
  estimated_duration_seconds integer check (estimated_duration_seconds is null or estimated_duration_seconds > 0),
  notes text,
  status job_board_status not null default 'queued',
  parent_plate_id uuid references plates (id) on delete set null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

comment on column plates.parent_plate_id is
  'Set when this plate is a reprint created from a Partial plate (see '
  'create_plate_reprint) — points at the original plate that partially '
  'failed. NULL for every plate that is not a reprint. NOT set for a '
  'duplicate (see duplicate_plate) — duplication is not lineage.';

create index idx_plates_job_id on plates (job_id);
create index idx_plates_status on plates (status);
create index idx_plates_parent_plate_id on plates (parent_plate_id) where parent_plate_id is not null;

-- ---------------------------------------------------------------------------
-- RLS — same pattern as print_jobs (0005_rls.sql): any active user can
-- read, only admins can write. Safety net only; the app writes through
-- server routes using the service role, which bypasses RLS.
-- ---------------------------------------------------------------------------

alter table jobs enable row level security;

create policy "active users can view jobs"
  on jobs for select
  using (is_active_app_user());

create policy "admins can insert jobs"
  on jobs for insert
  with check (current_app_role() = 'admin');

create policy "admins can update jobs"
  on jobs for update
  using (current_app_role() = 'admin')
  with check (current_app_role() = 'admin');

create policy "admins can delete jobs"
  on jobs for delete
  using (current_app_role() = 'admin');

alter table plates enable row level security;

create policy "active users can view plates"
  on plates for select
  using (is_active_app_user());

create policy "admins can insert plates"
  on plates for insert
  with check (current_app_role() = 'admin');

create policy "admins can update plates"
  on plates for update
  using (current_app_role() = 'admin')
  with check (current_app_role() = 'admin');

create policy "admins can delete plates"
  on plates for delete
  using (current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- plates.status transition enforcement — reuses can_transition_board_status
-- from 0017 (queued -> printing -> completed, or printing -> partial,
-- terminal), same idiom as enforce_board_status_transition.
-- ---------------------------------------------------------------------------

create function enforce_plate_status_transition() returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    if not can_transition_board_status(old.status, new.status) then
      raise exception 'Illegal plate status transition: "%" -> "%"', old.status, new.status
        using errcode = '22023';
    end if;

    if new.status in ('completed', 'partial') then
      new.completed_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_plates_enforce_status_transition
  before update on plates
  for each row execute function enforce_plate_status_transition();

-- ---------------------------------------------------------------------------
-- recompute_job_completed_at — after any plate is inserted, has its status
-- changed, or is deleted, check whether every remaining sibling plate for
-- that job is now terminal (completed/partial). If so, stamp
-- jobs.completed_at (only if not already set — sticky, one-way, see header
-- comment) and null out queue_position (removing it from the active-queue
-- reorder/drag surface). Never un-stamps.
-- ---------------------------------------------------------------------------

create function recompute_job_completed_at() returns trigger
language plpgsql
as $$
declare
  v_job_id uuid;
  v_all_terminal boolean;
begin
  v_job_id := coalesce(new.job_id, old.job_id);

  select not exists (
    select 1 from plates
    where job_id = v_job_id and status in ('queued', 'printing')
  ) into v_all_terminal;

  if v_all_terminal then
    update jobs
    set completed_at = coalesce(completed_at, now()),
        queue_position = null
    where id = v_job_id and completed_at is null;
  end if;

  return null;
end;
$$;

create trigger trg_plates_recompute_job_completed_at
  after insert or update of status or delete on plates
  for each row execute function recompute_job_completed_at();

-- ---------------------------------------------------------------------------
-- create_job_with_plates — atomically create a job and every one of its
-- plates (1 to N). p_plates is a jsonb array of
-- {id?, plateName, screenshotPath, colors?, estimatedDurationSeconds?, notes?}
-- — sort_order is assigned by array position.
-- ---------------------------------------------------------------------------

create function create_job_with_plates(
  p_job_id uuid,
  p_customer_name text,
  p_business business_name,
  p_notes text,
  p_created_by uuid,
  p_plates jsonb
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

  insert into jobs (id, customer_name, business, notes, queue_position, created_by)
  values (p_job_id, p_customer_name, p_business, p_notes, v_position, p_created_by)
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
-- add_plate_to_job — append one plate to an existing job at the end of its
-- sort order. Deliberately does not touch jobs.completed_at/queue_position
-- (see header comment — adding a plate to an archived job does not
-- reactivate it onto the Board).
-- ---------------------------------------------------------------------------

create function add_plate_to_job(
  p_plate_id uuid,
  p_job_id uuid,
  p_plate_name text,
  p_screenshot_path text,
  p_colors text,
  p_estimated_duration_seconds integer,
  p_notes text
) returns plates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sort_order integer;
  v_plate plates;
begin
  perform id from jobs where id = p_job_id for update;
  if not found then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_sort_order
  from plates where job_id = p_job_id;

  insert into plates (
    id, job_id, plate_name, screenshot_path, colors, estimated_duration_seconds, notes, sort_order
  ) values (
    p_plate_id, p_job_id, p_plate_name, p_screenshot_path, p_colors, p_estimated_duration_seconds, p_notes, v_sort_order
  )
  returning * into v_plate;

  return v_plate;
end;
$$;

revoke all on function add_plate_to_job from public;
grant execute on function add_plate_to_job to service_role;

-- ---------------------------------------------------------------------------
-- duplicate_plate — copy a plate's fields onto a new plate under the same
-- job, reset to queued, no parent_plate_id (a duplicate is not lineage,
-- unlike a reprint — see create_plate_reprint). Also powers "requeue a
-- terminal plate from History" — same operation.
-- ---------------------------------------------------------------------------

create function duplicate_plate(p_new_plate_id uuid, p_source_plate_id uuid) returns plates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source plates;
  v_sort_order integer;
  v_plate plates;
begin
  select * into v_source from plates where id = p_source_plate_id;
  if v_source.id is null then
    raise exception 'Source plate not found' using errcode = 'P0002';
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_sort_order
  from plates where job_id = v_source.job_id;

  insert into plates (
    id, job_id, plate_name, screenshot_path, colors, estimated_duration_seconds, notes, sort_order
  ) values (
    p_new_plate_id, v_source.job_id, v_source.plate_name, v_source.screenshot_path,
    v_source.colors, v_source.estimated_duration_seconds, v_source.notes, v_sort_order
  )
  returning * into v_plate;

  return v_plate;
end;
$$;

revoke all on function duplicate_plate from public;
grant execute on function duplicate_plate to service_role;

-- ---------------------------------------------------------------------------
-- set_plate_status — Start Printing / Complete / Partial. The trigger above
-- enforces legality and stamps completed_at; the recompute trigger above
-- handles the parent job's completed_at/queue_position as a side effect.
-- ---------------------------------------------------------------------------

create function set_plate_status(p_plate_id uuid, p_new_status job_board_status) returns plates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plate plates;
begin
  update plates
  set status = p_new_status
  where id = p_plate_id
  returning * into v_plate;

  if v_plate.id is null then
    raise exception 'Plate not found' using errcode = 'P0002';
  end if;

  return v_plate;
end;
$$;

revoke all on function set_plate_status from public;
grant execute on function set_plate_status to service_role;

-- ---------------------------------------------------------------------------
-- create_plate_reprint — the follow-up plate created after a Partial print.
-- Requires the source plate to already be marked 'partial'.
-- ---------------------------------------------------------------------------

create function create_plate_reprint(
  p_new_plate_id uuid,
  p_source_plate_id uuid,
  p_screenshot_path text
) returns plates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source plates;
  v_sort_order integer;
  v_plate plates;
begin
  select * into v_source from plates where id = p_source_plate_id;
  if v_source.id is null then
    raise exception 'Source plate not found' using errcode = 'P0002';
  end if;

  if v_source.status <> 'partial' then
    raise exception 'Only a plate marked Partial can have a reprint created from it'
      using errcode = '22023';
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_sort_order
  from plates where job_id = v_source.job_id;

  insert into plates (
    id, job_id, plate_name, screenshot_path, colors, estimated_duration_seconds, notes, parent_plate_id, sort_order
  ) values (
    p_new_plate_id, v_source.job_id, v_source.plate_name || ' - Reprint', p_screenshot_path,
    v_source.colors, v_source.estimated_duration_seconds, v_source.notes, p_source_plate_id, v_sort_order
  )
  returning * into v_plate;

  return v_plate;
end;
$$;

revoke all on function create_plate_reprint from public;
grant execute on function create_plate_reprint to service_role;

-- ---------------------------------------------------------------------------
-- reassign_job_business — drag a customer card to the other business
-- column: reassign business, append at the end of the destination queue.
-- (Named distinctly from 0017's move_job_to_business, which has the same
-- argument types and remains scoped to the archived print_jobs table.)
-- ---------------------------------------------------------------------------

create function reassign_job_business(p_job_id uuid, p_new_business business_name) returns jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_position integer;
  v_job jobs;
begin
  perform id from jobs where id = p_job_id for update;
  if not found then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;

  select coalesce(max(queue_position), 0) + 1 into v_position
  from jobs
  where business = p_new_business and queue_position is not null;

  update jobs
  set business = p_new_business,
      queue_position = case when queue_position is not null then v_position else queue_position end
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function reassign_job_business from public;
grant execute on function reassign_job_business to service_role;

-- ---------------------------------------------------------------------------
-- reorder_jobs_queue — atomically renumber queue_position within a
-- business's active (completed_at is null) job queue. Same two-phase
-- null-then-renumber approach as 0017's reorder_board_queue. (Named
-- distinctly for the same reason as reassign_job_business above.)
-- ---------------------------------------------------------------------------

create function reorder_jobs_queue(p_business business_name, p_ordered_job_ids uuid[]) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current uuid[];
  v_requested uuid[];
begin
  select coalesce(array_agg(id order by id), '{}') into v_current
  from jobs
  where business = p_business and completed_at is null and queue_position is not null;

  select coalesce(array_agg(x order by x), '{}') into v_requested
  from unnest(p_ordered_job_ids) as x;

  if v_current <> v_requested then
    raise exception 'Ordered job list does not match the current active queue for this business'
      using errcode = '22023';
  end if;

  update jobs set queue_position = null
  where id = any (p_ordered_job_ids);

  update jobs j
  set queue_position = t.pos
  from (
    select id, ordinality::integer as pos
    from unnest(p_ordered_job_ids) with ordinality as u (id, ordinality)
  ) t
  where j.id = t.id;
end;
$$;

revoke all on function reorder_jobs_queue from public;
grant execute on function reorder_jobs_queue to service_role;

-- ---------------------------------------------------------------------------
-- print_job_notifications: repoint the new board event types at plates/jobs
-- instead of the archived print_jobs table. job_completed/partial_created
-- are plate-level actions -> plate_id. job_moved is a customer-level drag
-- action -> job_id. print_job_id (legacy) becomes nullable since these new
-- events have no print_jobs row behind them; its existing partial-unique
-- dedup index (0017) already only applies to the legacy bridge types, so
-- this is safe.
-- ---------------------------------------------------------------------------

alter table print_job_notifications alter column print_job_id drop not null;

alter table print_job_notifications
  add column plate_id uuid references plates (id) on delete cascade,
  add column job_id uuid references jobs (id) on delete cascade;

comment on column print_job_notifications.plate_id is
  'Set for job_completed / partial_created events (plate-level actions, '
  'see migration 0018). NULL for legacy bridge types and for '
  'job_moved/queue_summary.';

comment on column print_job_notifications.job_id is
  'Set for job_moved events (customer-level drag action, see migration '
  '0018). NULL otherwise.';

create index idx_print_job_notifications_plate_id on print_job_notifications (plate_id) where plate_id is not null;
create index idx_print_job_notifications_job_id on print_job_notifications (job_id) where job_id is not null;

-- ---------------------------------------------------------------------------
-- Data migration: print_jobs -> jobs + plates, 1:1, preserving lineage.
-- Every print_jobs row becomes exactly one jobs row (customer_name = the
-- old job name, business/queue_position carried over as-is) and exactly
-- one plates row (plate_name = the old job name, screenshot/colors/
-- estimated_duration_seconds/notes/status carried over as-is, sort_order
-- 1). parent_job_id lineage is resolved to parent_plate_id via a temporary
-- id-mapping table. jobs.notes starts empty — the old notes were plate-
-- specific (a build-plate note), so they migrate onto the plate, not the
-- new order-level notes field.
-- ---------------------------------------------------------------------------

create temporary table _migration_job_plate_map (
  old_job_id uuid primary key,
  new_job_id uuid not null,
  new_plate_id uuid not null
) on commit drop;

insert into _migration_job_plate_map (old_job_id, new_job_id, new_plate_id)
select id, gen_random_uuid(), gen_random_uuid()
from print_jobs;

insert into jobs (id, customer_name, business, notes, queue_position, created_by, created_at, completed_at)
select
  m.new_job_id,
  pj.name,
  pj.business,
  null,
  pj.queue_position,
  pj.created_by,
  pj.created_at,
  case when pj.board_status in ('completed', 'partial') then coalesce(pj.completed_at, pj.updated_at) else null end
from print_jobs pj
join _migration_job_plate_map m on m.old_job_id = pj.id;

insert into plates (
  id, job_id, plate_name, screenshot_path, colors, estimated_duration_seconds, notes, status, sort_order, created_at, completed_at
)
select
  m.new_plate_id,
  m.new_job_id,
  pj.name,
  pj.screenshot_path,
  pj.colors,
  pj.estimated_duration_seconds,
  pj.notes,
  pj.board_status,
  1,
  pj.created_at,
  case when pj.board_status in ('completed', 'partial') then coalesce(pj.completed_at, pj.updated_at) else null end
from print_jobs pj
join _migration_job_plate_map m on m.old_job_id = pj.id;

update plates p
set parent_plate_id = pm.new_plate_id
from print_jobs pj
join _migration_job_plate_map cm on cm.old_job_id = pj.id
join _migration_job_plate_map pm on pm.old_job_id = pj.parent_job_id
where p.id = cm.new_plate_id and pj.parent_job_id is not null;

-- Sanity check: every row preserved, every lineage link resolved. Aborts
-- the whole migration transaction if not.
do $$
declare
  v_print_jobs_count integer;
  v_jobs_count integer;
  v_plates_count integer;
  v_unresolved_lineage integer;
begin
  select count(*) into v_print_jobs_count from print_jobs;
  select count(*) into v_jobs_count from jobs;
  select count(*) into v_plates_count from plates;

  if v_jobs_count <> v_print_jobs_count or v_plates_count <> v_print_jobs_count then
    raise exception 'Migration row count mismatch: print_jobs=%, jobs=%, plates=%',
      v_print_jobs_count, v_jobs_count, v_plates_count;
  end if;

  select count(*) into v_unresolved_lineage
  from print_jobs pj
  join _migration_job_plate_map cm on cm.old_job_id = pj.id
  join plates p on p.id = cm.new_plate_id
  where pj.parent_job_id is not null and p.parent_plate_id is null;

  if v_unresolved_lineage > 0 then
    raise exception 'Migration failed to preserve % parent_job_id -> parent_plate_id link(s)', v_unresolved_lineage;
  end if;
end;
$$;
