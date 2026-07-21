# Troubleshooting

## Web app

**"No printer configured" everywhere.** There's no row in `printers` yet,
or the web app can't reach Supabase. Check `NEXT_PUBLIC_SUPABASE_URL` /
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and confirm a `printers` row exists
(Table Editor, or re-run `pnpm db:seed`).

**Stuck on `/login` after entering correct credentials.** Check that the
Supabase Auth user has a corresponding `app_users` row with `active = true`
— an orphaned Auth user with no `app_users` row is treated as
unauthenticated everywhere (`getCurrentAppUser()` returns `null`).

**Upload fails with a 403 from Supabase Storage.** The uploading user's
`app_users.role` must be `admin` — Storage RLS (migration `0006_storage.sql`)
only allows admins to write to the `print-files` bucket.

**"Cannot find module '@print-queue/shared'" during build.** The shared
package has a build step (`tsup`) producing `packages/shared/dist`. Run
`pnpm --filter @print-queue/shared build` (or just `pnpm build` at the
root, which does this in the right order via Turborepo).

**Start Next button won't enable.** All three checkboxes must be checked —
by design, there is no way around this. If they're checked and it's still
disabled, check the browser console; a validation error in the form state
is the likely cause.

## Bridge

**Bridge never shows "online" on the dashboard.** Check:
1. The bridge process is actually running (`journalctl -u print-queue-bridge -f`,
   or `docker compose -f docker-compose.bridge.yml logs -f`).
2. `printers.bridge_id` in Supabase matches `BRIDGE_ID` in the bridge's
   `.env` exactly.
3. The bridge log shows `"msg":"Bound to printer"` — if instead it exits
   with "No printer row found with a matching bridge_id", fix #2.

**Commands stay `pending` forever.** The bridge isn't claiming them.
Check `COMMAND_POLL_INTERVAL_MS` isn't absurdly high, and check the bridge
logs for errors from `claim_next_printer_command` (a Postgres error here
usually means the service-role key is wrong or the migrations haven't
been applied).

**A job is stuck at `command_pending`/`downloading`/`uploading_to_printer`/`starting`
with no matching command activity.** The bridge likely crashed mid-process
on a previous run. On its next startup it runs `recoverStaleCommands()`
(`apps/bridge/src/recovery.ts`), which marks any command it still owns in
`claimed`/`processing` as `failed` and fails the associated job so it
becomes retryable. If the bridge hasn't restarted yet, restart it — the
recovery step only runs at startup.

**A retried job won't restart.** `retry_print_job` only accepts jobs with
`status = 'failed'`. If the job is wedged in an earlier active state, use
the bridge-crash recovery path above first.

## Mock printer (development)

**Print never "completes."** The mock adapter completes naturally after
its simulated duration (`durationMs`, default 30s) or when forced:
`pnpm --filter bridge sim complete`. See `apps/bridge/scripts/simulate-command.ts`.

**Want to test a failure?** `pnpm --filter bridge sim fail "some reason"`.

**Want to test the printer going offline?** `pnpm --filter bridge sim offline`,
then `pnpm --filter bridge sim online` to bring it back.

**Mock state seems stuck from a previous test run.** `pnpm --filter bridge sim reset`,
or just delete the `mock-printer-state.json` file inside `TEMP_DIRECTORY`.

## Bambu adapter (physical printer)

See `docs/bambu-integration.md` — it has a dedicated, ordered verification
checklist and a diagnostic script (`pnpm --filter bridge bambu:test-connection`).
Don't debug the full pipeline at once; isolate to
connection → status parsing → file upload → start command.

**Bridge startup health check fails.** The bridge logs exactly one of
these before exiting:

- **`✗ Cannot reach printer`** — the IP is wrong, the printer is off, it's
  not on this network, or something (firewall, VPN) is blocking port
  8883. Ping the IP; confirm it matches the printer's screen
  (Settings → Network). Note the printer's IP can change if your router
  doesn't reserve it (DHCP) — consider a static DHCP lease for it.
- **`✗ Invalid access code`** — `BAMBU_ACCESS_CODE` doesn't match what's
  shown on the printer's screen right now. The access code can be
  regenerated from the printer's screen, which would invalidate an old
  one saved in `.env`.
- **`✗ Authentication failed`** — the printer refused the connection for
  a reason other than a bad access code. Confirm the serial number is
  correct and that nothing else has revoked local API access.

**You do NOT need to enable "LAN Only Mode"** for any of this — the local
MQTT/FTPS API is on by default and independent of that toggle. If you
previously enabled it just for this app, you can safely turn it back off
without breaking the bridge connection.

**Status looks like it's flickering between two unrelated printers/files.**
You likely have more than one `pnpm bridge:dev` process running against
the same printer (e.g. an old one from a previous session you forgot was
still open) — each instance independently polls and writes status, and
they'll stomp on each other. Run `ps aux | grep "tsx.*src/index.ts"`,
kill the duplicates, and confirm only one remains before restarting.
Production deployments (systemd/Docker) don't hit this since exactly one
instance runs.

## Deleting jobs

Deleting a job that's already in history (completed/failed/skipped/
cancelled) requires an explicit confirmation
(`DELETE /api/jobs/[id]/delete?confirm=true`) — the Queue screen's Remove
button only appears for jobs still in the active queue; deleting history
entries isn't wired into the UI on purpose, to avoid losing print history
by accident. If you need to do it, call the route directly with
`confirm=true`.
