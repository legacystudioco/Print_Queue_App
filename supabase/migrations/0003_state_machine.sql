-- Database-level enforcement of legal print_job status transitions.
--
-- This mirrors canTransitionJobStatus() in packages/shared/src/state-machine.ts.
-- Keeping both is intentional: the TypeScript guard gives fast, friendly
-- errors in the app and bridge; this trigger is the last line of defense so
-- no code path (including future ones) can ever corrupt a job's lifecycle,
-- even via a direct SQL statement or a bug in application code.

create function can_transition_print_job_status(p_from print_job_status, p_to print_job_status)
returns boolean
language sql
immutable
as $$
  select case p_from
    when 'uploaded' then p_to in ('queued', 'cancelled')
    when 'queued' then p_to in ('ready', 'command_pending', 'skipped', 'cancelled')
    when 'ready' then p_to in ('queued', 'command_pending', 'skipped', 'cancelled')
    when 'command_pending' then p_to in ('downloading', 'failed', 'cancelled')
    when 'downloading' then p_to in ('uploading_to_printer', 'failed', 'cancelled')
    when 'uploading_to_printer' then p_to in ('starting', 'failed', 'cancelled')
    when 'starting' then p_to in ('printing', 'failed', 'cancelled')
    when 'printing' then p_to in ('completed', 'failed', 'cancelled')
    when 'completed' then false
    when 'failed' then p_to = 'queued'
    when 'skipped' then false
    when 'cancelled' then false
    else false
  end;
$$;

create function enforce_print_job_status_transition() returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    if not can_transition_print_job_status(old.status, new.status) then
      raise exception 'Illegal print job status transition: "%" -> "%"', old.status, new.status
        using errcode = '22023'; -- invalid_parameter_value
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_print_jobs_enforce_status_transition
  before update on print_jobs
  for each row execute function enforce_print_job_status_transition();
