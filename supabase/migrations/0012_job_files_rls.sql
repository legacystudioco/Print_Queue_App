-- Row Level Security for job_files. Mirrors job_ams_slots exactly (0005_rls.sql):
-- any active app user can read, only admins can write. Writes only ever
-- happen through the service-role RPCs in 0013 — these policies exist purely
-- as a fail-safe for a future authenticated-client write path.

alter table job_files enable row level security;

create policy "active users can view job files"
  on job_files for select
  using (is_active_app_user());

create policy "admins can manage job files"
  on job_files for all
  using (current_app_role() = 'admin')
  with check (current_app_role() = 'admin');
