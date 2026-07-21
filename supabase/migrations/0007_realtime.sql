-- Enable Realtime change feeds for the tables the UI subscribes to:
--   - printer_commands: Start Next screen watches its own command's status.
--   - print_jobs / printers: Dashboard and Queue can live-update without polling.
-- Safe to re-run: guards against the table already being a publication member.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'printer_commands'
  ) then
    alter publication supabase_realtime add table printer_commands;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'print_jobs'
  ) then
    alter publication supabase_realtime add table print_jobs;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'printers'
  ) then
    alter publication supabase_realtime add table printers;
  end if;
end $$;
