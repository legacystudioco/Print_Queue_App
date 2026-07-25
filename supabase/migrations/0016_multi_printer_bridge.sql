-- Multi-printer bridge support: one bridge host (the old Mac) now runs a
-- worker per physical printer instead of one bridge process per printer.
-- `printers.bridge_id` already associates a physical printer with the
-- machine responsible for reaching it — see 0001_extensions_enums_tables.sql
-- and apps/bridge/src/config.ts's BRIDGE_ID — so no new "bridge host"
-- column is introduced here, just an `enabled` flag so a printer row can be
-- taken out of rotation without deleting it.
--
-- Deliberately does NOT rename the existing bridge_id. The old Mac's real,
-- deployed BRIDGE_ID is whatever the existing Bambu printer row already
-- uses — this migration reads that value and reuses it for the new
-- Flashforge row (see step 5), so no bridge_id ever changes and no
-- coordinated BRIDGE_ID env var update is required on deployment. Renaming
-- an identifier that's already working is unnecessary churn and risks
-- orphaning anything that assumed the old value.
--
-- Also adds the `deliver_print` command type (upload a file without
-- starting it — see packages/shared/src/schemas/command.ts) and the
-- corresponding `uploading_to_printer -> ready` state-machine edge, and
-- idempotently creates the Flashforge (SquishPrint) physical printer row.
--
-- Every step is safe to retry: IF NOT EXISTS guards on the two ALTER
-- statements, `create or replace` for the function, and a `where not
-- exists` guard on the Flashforge insert (on top of the pre-existing
-- uq_printers_brand unique index as a second line of defense).

-- ---------------------------------------------------------------------------
-- 1. Printer enable/disable flag
-- ---------------------------------------------------------------------------

alter table printers add column if not exists enabled boolean not null default true;

comment on column printers.enabled is
  'Whether the bridge supervisor should start a worker for this printer. '
  'A disabled row stays in the table (history, job references) but is '
  'skipped by BridgeSupervisor''s printer query.';

-- ---------------------------------------------------------------------------
-- 2. New printer_command_type: deliver_print
-- ---------------------------------------------------------------------------

alter type printer_command_type add value if not exists 'deliver_print';

-- ---------------------------------------------------------------------------
-- 3. State machine: allow a delivery-only upload to return the job to `ready`
--    instead of continuing on to `starting`/`printing`. Mirrors the added
--    edge in packages/shared/src/state-machine.ts.
-- ---------------------------------------------------------------------------

create or replace function can_transition_print_job_status(p_from print_job_status, p_to print_job_status)
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
    when 'uploading_to_printer' then p_to in ('starting', 'ready', 'failed', 'cancelled')
    when 'starting' then p_to in ('printing', 'failed', 'cancelled')
    when 'printing' then p_to in ('completed', 'failed', 'cancelled')
    when 'completed' then false
    when 'failed' then p_to = 'queued'
    when 'skipped' then false
    when 'cancelled' then false
    else false
  end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Idempotently create the Flashforge (SquishPrint) physical printer row,
--    assigned to the SAME bridge host as the existing Bambu printer (read
--    dynamically, not hardcoded — see note above). If no Bambu row exists
--    yet (a fresh install), bridge_id is left NULL and must be set manually;
--    in this app's actual deployment history a Bambu row always exists
--    first.
--
--    `uq_printers_brand` (0010_printer_brand.sql) already guarantees at most
--    one row per brand — the `where not exists` guard below additionally
--    keeps a retry from ever attempting (and failing loudly on) a duplicate
--    insert.
--
--    local_ip and serial_number are intentionally left NULL here: per the
--    existing convention (see the printers table comment), actual
--    connection details (host/serial/access code) live only in the bridge's
--    environment variables (FLASHFORGE_HOST / FLASHFORGE_SERIAL_NUMBER /
--    FLASHFORGE_ACCESS_CODE), never committed to source control or seeded
--    into this table. An operator may optionally fill these columns in
--    later via a direct (uncommitted) update, purely for display purposes.
-- ---------------------------------------------------------------------------

insert into printers (name, model, brand, bridge_id, enabled)
select
  'SquishPrint',
  'Adventurer 5M',
  'flashforge',
  (select bridge_id from printers where brand = 'bambu' limit 1),
  true
where not exists (select 1 from printers where brand = 'flashforge');
