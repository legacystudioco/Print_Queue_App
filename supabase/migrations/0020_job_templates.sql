-- Job Templates: a reusable recipe of plates (name/screenshot/colors/time/
-- notes/order) that "Create Job from Template" snapshots into a real job +
-- plates in one atomic operation. Templates are their own two-table
-- hierarchy (job_templates -> job_template_plates), deliberately separate
-- from jobs/plates rather than an "is_template" flag on production tables
-- — see migration plan. Editing or deleting/archiving a template must never
-- affect a job previously created from it; this is enforced structurally
-- (no foreign key from plates back to job_template_plates) rather than by
-- convention.
--
-- Screenshot storage: every job_template_plates.screenshot_path is an
-- object under the *same* private 'job-screenshots' bucket (0006/0017), just
-- scoped under a `templates/{template_id}/...` prefix instead of a job id.
-- A template plate's screenshot object is NEVER the same storage object as
-- any job plate's, and never shared between two templates — every copy
-- across a template/job boundary (or duplicate-within-template) gets a
-- fresh object via Storage's copy API at the application layer (Postgres
-- has no reach into Storage). That single rule is what makes every delete/
-- archive path below unconditionally safe with zero reference counting.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- job_templates — the reusable recipe.
-- ---------------------------------------------------------------------------

create table job_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  default_business business_name not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

comment on table job_templates is
  'A reusable recipe of plates a job can be created from (see '
  'create_job_with_plates, called by the app after resolving a template''s '
  'plates to fresh screenshot copies). Archiving/deleting a template never '
  'touches jobs already created from it — there is no link back.';

comment on column job_templates.archived_at is
  'Set to hide a template from the active library without deleting its '
  'plates/screenshots. NULL = active. Independent of jobs.completed_at''s '
  'semantics — archiving is a manual, reversible toggle here, not a '
  'one-way stamp.';

create index idx_job_templates_archived_at on job_templates (archived_at);

-- ---------------------------------------------------------------------------
-- job_template_plates — one reusable plate definition belonging to a
-- template.
-- ---------------------------------------------------------------------------

create table job_template_plates (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references job_templates (id) on delete cascade,
  plate_name text not null,
  screenshot_path text,
  colors text,
  estimated_duration_seconds integer check (estimated_duration_seconds is null or estimated_duration_seconds > 0),
  notes text,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column job_template_plates.screenshot_path is
  'Object path in the job-screenshots bucket, under templates/{template_id}/. '
  'Always an independent object — never shared with a job plate or another '
  'template''s plate. See migration header comment.';

create index idx_job_template_plates_template_id on job_template_plates (template_id);

-- ---------------------------------------------------------------------------
-- RLS — same pattern as jobs/plates (0018): any active user can read, only
-- admins can write. Safety net only; the app writes through server routes
-- using the service role, which bypasses RLS.
-- ---------------------------------------------------------------------------

alter table job_templates enable row level security;

create policy "active users can view job templates"
  on job_templates for select
  using (is_active_app_user());

create policy "admins can insert job templates"
  on job_templates for insert
  with check (current_app_role() = 'admin');

create policy "admins can update job templates"
  on job_templates for update
  using (current_app_role() = 'admin')
  with check (current_app_role() = 'admin');

create policy "admins can delete job templates"
  on job_templates for delete
  using (current_app_role() = 'admin');

alter table job_template_plates enable row level security;

create policy "active users can view job template plates"
  on job_template_plates for select
  using (is_active_app_user());

create policy "admins can insert job template plates"
  on job_template_plates for insert
  with check (current_app_role() = 'admin');

create policy "admins can update job template plates"
  on job_template_plates for update
  using (current_app_role() = 'admin')
  with check (current_app_role() = 'admin');

create policy "admins can delete job template plates"
  on job_template_plates for delete
  using (current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- updated_at — reuse set_updated_at() from 0002_indexes_triggers.sql, same
-- as push_subscriptions/notification_preferences.
-- ---------------------------------------------------------------------------

create trigger trg_job_templates_updated_at
  before update on job_templates
  for each row execute function set_updated_at();

create trigger trg_job_template_plates_updated_at
  before update on job_template_plates
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- create_job_template — atomically create a template and zero or more of
-- its plates. Unlike create_job_with_plates, an empty p_plates array is
-- valid (a template can be built up one plate at a time after creation via
-- add_template_plate). Used both by manual "Create Template" and "Save as
-- Template" — the caller prepares p_plates differently in each case, but
-- this function doesn't need to know which.
-- ---------------------------------------------------------------------------

create function create_job_template(
  p_template_id uuid,
  p_name text,
  p_description text,
  p_default_business business_name,
  p_plates jsonb
) returns job_templates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template job_templates;
begin
  insert into job_templates (id, name, description, default_business)
  values (p_template_id, p_name, p_description, p_default_business)
  returning * into v_template;

  if p_plates is not null and jsonb_array_length(p_plates) > 0 then
    insert into job_template_plates (
      id, template_id, plate_name, screenshot_path, colors, estimated_duration_seconds, notes, sort_order
    )
    select
      coalesce((elem->>'id')::uuid, gen_random_uuid()),
      p_template_id,
      elem->>'plateName',
      elem->>'screenshotPath',
      elem->>'colors',
      nullif(elem->>'estimatedDurationSeconds', '')::integer,
      elem->>'notes',
      ord::integer
    from jsonb_array_elements(p_plates) with ordinality as t(elem, ord);
  end if;

  return v_template;
end;
$$;

revoke all on function create_job_template from public;
grant execute on function create_job_template to service_role;

-- ---------------------------------------------------------------------------
-- add_template_plate — append one plate to an existing template at the end
-- of its sort order. Mirrors add_plate_to_job.
-- ---------------------------------------------------------------------------

create function add_template_plate(
  p_plate_id uuid,
  p_template_id uuid,
  p_plate_name text,
  p_screenshot_path text,
  p_colors text,
  p_estimated_duration_seconds integer,
  p_notes text
) returns job_template_plates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sort_order integer;
  v_plate job_template_plates;
begin
  perform id from job_templates where id = p_template_id for update;
  if not found then
    raise exception 'Template not found' using errcode = 'P0002';
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_sort_order
  from job_template_plates where template_id = p_template_id;

  insert into job_template_plates (
    id, template_id, plate_name, screenshot_path, colors, estimated_duration_seconds, notes, sort_order
  ) values (
    p_plate_id, p_template_id, p_plate_name, p_screenshot_path, p_colors, p_estimated_duration_seconds, p_notes, v_sort_order
  )
  returning * into v_plate;

  return v_plate;
end;
$$;

revoke all on function add_template_plate from public;
grant execute on function add_template_plate to service_role;

-- ---------------------------------------------------------------------------
-- duplicate_template_plate — copy a plate's fields onto a new plate under
-- the same template. Unlike duplicate_plate (which reuses the source's
-- screenshot_path for job plates), this takes the screenshot path as a
-- parameter — the caller must already have copied the screenshot to a new
-- storage object via the Storage API before calling this, per the
-- migration header's independence rule.
-- ---------------------------------------------------------------------------

create function duplicate_template_plate(
  p_new_plate_id uuid,
  p_source_plate_id uuid,
  p_screenshot_path text
) returns job_template_plates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source job_template_plates;
  v_sort_order integer;
  v_plate job_template_plates;
begin
  select * into v_source from job_template_plates where id = p_source_plate_id;
  if v_source.id is null then
    raise exception 'Source template plate not found' using errcode = 'P0002';
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_sort_order
  from job_template_plates where template_id = v_source.template_id;

  insert into job_template_plates (
    id, template_id, plate_name, screenshot_path, colors, estimated_duration_seconds, notes, sort_order
  ) values (
    p_new_plate_id, v_source.template_id, v_source.plate_name, p_screenshot_path,
    v_source.colors, v_source.estimated_duration_seconds, v_source.notes, v_sort_order
  )
  returning * into v_plate;

  return v_plate;
end;
$$;

revoke all on function duplicate_template_plate from public;
grant execute on function duplicate_template_plate to service_role;

-- ---------------------------------------------------------------------------
-- reorder_template_plates — atomically renumber sort_order for every plate
-- of one template. Simpler than reorder_jobs_queue: no unique index on
-- (template_id, sort_order) exists (matching plates having none on
-- (job_id, sort_order) either), so no null-first two-phase trick is needed.
-- ---------------------------------------------------------------------------

create function reorder_template_plates(p_template_id uuid, p_ordered_plate_ids uuid[]) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current uuid[];
  v_requested uuid[];
begin
  select coalesce(array_agg(id order by id), '{}') into v_current
  from job_template_plates
  where template_id = p_template_id;

  select coalesce(array_agg(x order by x), '{}') into v_requested
  from unnest(p_ordered_plate_ids) as x;

  if v_current <> v_requested then
    raise exception 'Ordered plate list does not match this template''s current plates'
      using errcode = '22023';
  end if;

  update job_template_plates t
  set sort_order = u.pos
  from (
    select id, ordinality::integer as pos
    from unnest(p_ordered_plate_ids) with ordinality as x (id, ordinality)
  ) u
  where t.id = u.id;
end;
$$;

revoke all on function reorder_template_plates from public;
grant execute on function reorder_template_plates to service_role;

-- ---------------------------------------------------------------------------
-- duplicate_job_template — create an independent copy of a template and
-- all of its plates. p_plates is a jsonb array of {id, screenshotPath}
-- ordered to zip against the source template's plates ordered by
-- sort_order — the caller must already have copied every screenshot to a
-- new storage object before calling this (same independence rule as
-- duplicate_template_plate).
-- ---------------------------------------------------------------------------

create function duplicate_job_template(
  p_new_template_id uuid,
  p_source_template_id uuid,
  p_new_name text,
  p_plates jsonb
) returns job_templates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source job_templates;
  v_template job_templates;
begin
  select * into v_source from job_templates where id = p_source_template_id;
  if v_source.id is null then
    raise exception 'Source template not found' using errcode = 'P0002';
  end if;

  insert into job_templates (id, name, description, default_business)
  values (p_new_template_id, p_new_name, v_source.description, v_source.default_business)
  returning * into v_template;

  insert into job_template_plates (
    id, template_id, plate_name, screenshot_path, colors, estimated_duration_seconds, notes, sort_order
  )
  select
    (new_plate->>'id')::uuid,
    p_new_template_id,
    src.plate_name,
    new_plate->>'screenshotPath',
    src.colors,
    src.estimated_duration_seconds,
    src.notes,
    src.sort_order
  from (
    select *, row_number() over (order by sort_order) as rn
    from job_template_plates
    where template_id = p_source_template_id
  ) src
  join (
    select elem as new_plate, ord::integer as rn
    from jsonb_array_elements(p_plates) with ordinality as t(elem, ord)
  ) np on np.rn = src.rn;

  return v_template;
end;
$$;

revoke all on function duplicate_job_template from public;
grant execute on function duplicate_job_template to service_role;
