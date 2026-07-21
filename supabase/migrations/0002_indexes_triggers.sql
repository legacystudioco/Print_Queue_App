-- Indexes, updated_at triggers, and queue-position uniqueness.

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index idx_print_jobs_printer_id on print_jobs (printer_id);
create index idx_print_jobs_status on print_jobs (status);
create index idx_print_jobs_created_by on print_jobs (created_by);

-- Only one job may occupy a given queue position per printer, but many jobs
-- may share NULL (i.e. not be in the active queue at all).
create unique index uq_print_jobs_printer_queue_position
  on print_jobs (printer_id, queue_position)
  where queue_position is not null;

create index idx_job_ams_slots_job_id on job_ams_slots (job_id);

create index idx_printer_commands_printer_id_status on printer_commands (printer_id, status);
create index idx_printer_commands_print_job_id on printer_commands (print_job_id);

create index idx_printer_events_printer_id on printer_events (printer_id, created_at desc);
create index idx_printer_events_print_job_id on printer_events (print_job_id);

create index idx_bed_clear_confirmations_print_job_id on bed_clear_confirmations (print_job_id);

create index idx_app_users_role on app_users (role) where active;

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create function set_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_app_users_updated_at
  before update on app_users
  for each row execute function set_updated_at();

create trigger trg_printers_updated_at
  before update on printers
  for each row execute function set_updated_at();

create trigger trg_print_jobs_updated_at
  before update on print_jobs
  for each row execute function set_updated_at();

create trigger trg_job_ams_slots_updated_at
  before update on job_ams_slots
  for each row execute function set_updated_at();
