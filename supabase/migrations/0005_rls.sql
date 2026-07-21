-- Row Level Security.
--
-- Core rule: only an *active* row in app_users grants any access at all.
-- Helper functions below are SECURITY DEFINER so they can read app_users
-- without recursing through app_users' own RLS policy.

create function is_active_app_user() returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from app_users where id = auth.uid() and active = true
  );
$$;

create function current_app_role() returns user_role
language sql
security definer
stable
set search_path = public
as $$
  select role from app_users where id = auth.uid() and active = true;
$$;

grant execute on function is_active_app_user to authenticated;
grant execute on function current_app_role to authenticated;

-- ---------------------------------------------------------------------------
-- app_users
-- ---------------------------------------------------------------------------

alter table app_users enable row level security;

create policy "active users can view app users"
  on app_users for select
  using (is_active_app_user());

-- No insert/update/delete policy for authenticated/anon: accounts are
-- provisioned manually (see docs/setup-supabase.md). The service role
-- (used by trusted server code / seed scripts) bypasses RLS entirely.

-- ---------------------------------------------------------------------------
-- printers
-- ---------------------------------------------------------------------------

alter table printers enable row level security;

create policy "active users can view printers"
  on printers for select
  using (is_active_app_user());

create policy "admins can update printer settings"
  on printers for update
  using (current_app_role() = 'admin')
  with check (current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- print_jobs
-- ---------------------------------------------------------------------------

alter table print_jobs enable row level security;

create policy "active users can view print jobs"
  on print_jobs for select
  using (is_active_app_user());

-- Safety net only: the app always writes through server routes using the
-- service role (which bypasses RLS), never directly from the browser. These
-- policies exist so a future authenticated-client code path fails safe.
create policy "admins can insert print jobs"
  on print_jobs for insert
  with check (current_app_role() = 'admin');

create policy "admins can update print jobs"
  on print_jobs for update
  using (current_app_role() = 'admin')
  with check (current_app_role() = 'admin');

create policy "admins can delete print jobs"
  on print_jobs for delete
  using (current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- job_ams_slots
-- ---------------------------------------------------------------------------

alter table job_ams_slots enable row level security;

create policy "active users can view ams slots"
  on job_ams_slots for select
  using (is_active_app_user());

create policy "admins can manage ams slots"
  on job_ams_slots for all
  using (current_app_role() = 'admin')
  with check (current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- printer_commands — read-only for clients; all writes go through the
-- start_next_print / claim_next_printer_command SECURITY DEFINER functions
-- called with the service role.
-- ---------------------------------------------------------------------------

alter table printer_commands enable row level security;

create policy "active users can view printer commands"
  on printer_commands for select
  using (is_active_app_user());

-- ---------------------------------------------------------------------------
-- printer_events — read-only for clients; only the bridge (service role)
-- writes events.
-- ---------------------------------------------------------------------------

alter table printer_events enable row level security;

create policy "active users can view printer events"
  on printer_events for select
  using (is_active_app_user());

-- ---------------------------------------------------------------------------
-- bed_clear_confirmations — read-only for clients; written only via the
-- start_next_print function.
-- ---------------------------------------------------------------------------

alter table bed_clear_confirmations enable row level security;

create policy "active users can view bed clear confirmations"
  on bed_clear_confirmations for select
  using (is_active_app_user());
