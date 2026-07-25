-- Bugfix: queue_position must be NULL for any job that has left the active
-- queue (see the column comment on print_jobs.queue_position in
-- 0001_extensions_enums_tables.sql) — but three write paths transition a
-- job to a terminal status without clearing it: the web app's skip route,
-- and the bridge's completed/failed transitions (commandLoop.ts,
-- recovery.ts). Left uncleared, a terminal job's stale low queue_position
-- collides with reorder_queue's renumbering (which restarts the waiting
-- set at 1), causing every reorder attempt to fail with a unique
-- constraint violation once enough jobs have completed/failed/been
-- skipped. reassign_job_printer is unaffected (it only ever appends via
-- max(queue_position)+1, never renumbers from 1).
--
-- Fixed once, at the database level, so no current or future write path
-- can reintroduce this: any transition into a terminal status now always
-- clears queue_position as part of the same update, in the trigger that
-- already guards legal status transitions.

create or replace function enforce_print_job_status_transition() returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    if not can_transition_print_job_status(old.status, new.status) then
      raise exception 'Illegal print job status transition: "%" -> "%"', old.status, new.status
        using errcode = '22023';
    end if;

    if new.status in ('completed', 'failed', 'skipped', 'cancelled') then
      new.queue_position := null;
    end if;
  end if;
  return new;
end;
$$;

-- One-time cleanup of rows already corrupted by the missing clear above.
update print_jobs
set queue_position = null
where status in ('completed', 'failed', 'skipped', 'cancelled')
  and queue_position is not null;
