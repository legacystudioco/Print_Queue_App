# Architecture

## Overview

```
┌─────────────────┐        ┌───────────────────────┐        ┌──────────────────┐
│   Phone/Laptop   │ HTTPS  │   Next.js web app     │        │     Supabase     │
│  (anywhere)      ├───────►│   (Vercel)            │◄──────►│  Postgres + Auth │
└─────────────────┘        │  - Server Components  │        │  + Storage       │
                            │  - Route handlers      │        │  + Realtime      │
                            │  - Service-role calls  │        └─────────┬────────┘
                            └───────────────────────┘                  │
                                                                        │ service role
                                                                        │ (polling +
                                                                        │  Storage download)
                                                              ┌─────────▼────────┐
                                                              │   Home bridge    │
                                                              │  (Node.js, LAN)  │
                                                              └─────────┬────────┘
                                                                        │ MQTTS + FTPS
                                                                        │ (local network only)
                                                              ┌─────────▼────────┐
                                                              │  Bambu Lab P1S   │
                                                              └──────────────────┘
```

The web app and the printer never talk directly. The web app writes
**commands** into Supabase; the bridge — running on a machine on the same
network as the printer — polls for commands, executes them against the
printer, and writes status back. This is what lets the app live on the
public internet (via Vercel) while the printer stays fully inside the home
network with no port forwarding and no direct exposure.

## Why this shape

- **Vercel can't reach the printer.** It's a serverless platform with no
  fixed egress to a home LAN. The bridge inverts the connection: it reaches
  out to Supabase (over HTTPS/WSS), so nothing needs to be exposed inbound
  on the home network.
- **Supabase is the only shared state.** Both the web app and the bridge
  are just clients of the same Postgres database — there's no custom
  server-to-server protocol to design or secure.
- **Commands, not RPC.** The web app doesn't ask the bridge to do things
  directly; it inserts a row describing what should happen
  (`printer_commands`), and the bridge claims and executes it
  independently. This means the web app can be down, slow, or scaled to
  zero without affecting a print already in progress, and the bridge can
  be offline without the web app hanging on a request.

## Monorepo layout

```
apps/
  web/        Next.js app (App Router), deployed to Vercel
  bridge/     Node.js service that runs at home, talks to the printer
packages/
  shared/     Zod schemas, TS types, the print-job state machine —
              imported by both web and bridge so they can never drift
supabase/
  migrations/ SQL schema, RLS policies, Postgres functions
docs/         You are here
scripts/      One-off scripts (DB seed helper)
```

## Data model

See the SQL in `supabase/migrations/0001_extensions_enums_tables.sql` for
the authoritative schema. In brief:

- `app_users` — the allow-list. A Supabase Auth user with no row here (or
  an inactive one) has zero access to anything, enforced by RLS.
- `printers` — one row per physical printer (this app expects exactly one
  in practice, but nothing hard-codes that).
- `print_jobs` — the queue and its history in one table, distinguished by
  `status`. Active queue = non-terminal statuses, ordered by
  `queue_position`.
- `job_ams_slots` — 4 rows per job (slots 1-4), manually entered.
- `printer_commands` — the command outbox the bridge polls. Idempotency is
  enforced by a unique `idempotency_key`.
- `printer_events` — an append-only log used for both "status history" and
  live progress/telemetry display.
- `bed_clear_confirmations` — one row per Start Next confirmation, an audit
  trail of who confirmed what before a print started.

## The print job state machine

`packages/shared/src/state-machine.ts` defines every legal transition
(`canTransitionJobStatus`). It is enforced in three independent places on
purpose:

1. The shared TS function — used by the web app's API routes and the
   bridge, giving fast, friendly errors.
2. A Postgres trigger (`supabase/migrations/0003_state_machine.sql`) that
   mirrors the same table — so even a direct SQL statement or a future bug
   can't corrupt a job's lifecycle.
3. The `start_next_print` Postgres function additionally enforces the
   "only one active print at a time" and "only the true next job can
   start" invariants under a row lock, which is a stronger guarantee than
   the state machine alone can express.

## Command lifecycle

1. Operator/admin completes the Start Next checklist in the browser.
2. The browser calls `POST /api/start-next` (a Next.js route handler).
3. That route validates the session + role, then calls the
   `start_next_print` Postgres function via the service-role client.
4. That function — atomically, under a lock on the `printers` row —
   verifies no other print/command is active, verifies this is really the
   next queued job, inserts the `bed_clear_confirmations` row, inserts a
   `printer_commands` row (`status = 'pending'`), and flips the job to
   `command_pending`.
5. The bridge's command loop calls `claim_next_printer_command` on its own
   poll interval. That function locks and claims the oldest pending command
   for its printer, `SKIP LOCKED` so two bridge processes can never claim
   the same one.
6. The bridge processes the command: download → upload to printer → start →
   mark `printing`. Every step transitions the job through the state
   machine and logs a `printer_events` row.
7. Independently, the bridge's status-report loop polls the printer every
   `HEARTBEAT_INTERVAL_MS` and updates `printers.status` /
   `printers.last_seen_at`, and detects completion/failure on its own —
   this is what finishes the job even if no command is in flight.
8. Nothing ever automatically starts the next job. That only happens when
   a human repeats step 1.

## Realtime

The web app subscribes to Postgres changes on `printer_commands` (for the
Start Next screen's live command-status display) via Supabase Realtime.
Everything else is server-rendered per request — this is a low-traffic,
two-person app, so polling-via-navigation is simpler than wiring Realtime
everywhere and is fast enough in practice.
