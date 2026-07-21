# Build Progress

## Phase 1 — Foundation ✅

- pnpm workspace + Turborepo monorepo (`apps/web`, `apps/bridge`,
  `packages/shared`).
- TypeScript strict mode everywhere, ESLint (flat config) + Prettier.
- Next.js 15 App Router app scaffolded with Tailwind.
- Bridge app scaffolded as a Node.js/TypeScript service.
- `packages/shared` set up with its own build (`tsup`) so both apps can
  depend on compiled output rather than raw source (avoids module
  resolution conflicts between Next's webpack and the bridge's NodeNext
  resolution — see commit history for why).

## Phase 2 — Supabase Data Layer ✅

- Full schema in `supabase/migrations/`: enums, all 7 tables, indexes,
  `updated_at` triggers, a partial-unique index preventing duplicate queue
  positions.
- Centralized state-machine trigger (`0003_state_machine.sql`) mirroring
  `packages/shared`'s `canTransitionJobStatus`.
- Business-logic Postgres functions (`0004_functions.sql`):
  `create_print_job`, `reorder_queue`, `retry_print_job`,
  `start_next_print`, `claim_next_printer_command` — all `SECURITY DEFINER`,
  granted only to `service_role`, each locking the parent `printers` row to
  serialize concurrency-sensitive operations.
- RLS on every table (`0005_rls.sql`): active-app-user gate plus
  role-specific write policies (mostly safety nets, since real writes go
  through the service role from server code).
- Private `print-files` storage bucket + policies (`0006_storage.sql`).
- Realtime publication membership for `printer_commands`/`print_jobs`/`printers`
  (`0007_realtime.sql`).
- `scripts/seed.ts` — seeds `app_users`, a printer, and sample queued jobs;
  deliberately does NOT create Auth users (documented manual process in
  `docs/setup-supabase.md`).

## Phase 3 — Web UI ✅

All screens from the spec: Login, Dashboard, Queue (with drag-and-drop +
up/down reorder), Add Print (direct-to-Storage upload with real progress,
AMS slot editor), Job Details, Start Next (large checklist + AMS cards),
History, plus an Edit Print page. Mobile-first, installable PWA (manifest,
icons, safe-area handling, standalone display), loading/empty/error states
throughout. `pnpm --filter web build` passes.

## Phase 4 — Command System ✅

Secure route handlers for every mutating action (`/api/jobs`,
`/api/jobs/[id]`, `/api/jobs/[id]/{skip,retry,delete}`,
`/api/queue/reorder`, `/api/start-next`, `/api/files/[id]/signed-url`),
each enforcing role + rate limits before calling the service-role client.
Bed-clear confirmations and idempotent command creation happen atomically
inside `start_next_print`. The Start Next screen subscribes to
`printer_commands` via Supabase Realtime for live status.

## Unit tests ✅

24 tests in `packages/shared` (state machine + Zod schemas), 3 in
`apps/web` (rate limiter), 16 in `apps/bridge` (config validation, job
status transitions, full mock-adapter lifecycle) — 43 total, all passing.
See `docs/testing.md` for exactly what's covered and what still needs a
live Supabase instance to test honestly (atomic claiming, idempotent
command creation under real concurrency, RLS policies, the DB trigger).

## Phase 5 — Bridge ✅

- Structured JSON logging, Zod-validated env config.
- `StatusReporter`: combined heartbeat + status-report loop (satisfies
  both "heartbeat every 15-30s" and "periodically report status" with one
  mechanism) — detects print completion/failure on its own and updates
  the job, without ever starting the next one.
- `CommandLoop`: polls `claim_next_printer_command`, double-checks
  ownership before acting, dispatches by command type, marks
  `processing`/`completed`/`failed` with error messages.
- `MockPrinterAdapter`: full simulated lifecycle (idle → printing →
  completed/failed, pause/resume with progress preservation, offline),
  persisted to a JSON file so a separate `pnpm sim` CLI can poke a running
  bridge process from another terminal.
- `recovery.ts`: on startup, finds commands this bridge claimed but never
  finished (crash recovery) and fails them + their jobs for manual retry,
  without ever auto-retrying (to avoid double-starting a print).
- File download from private Storage, temp-file cleanup in a `finally`.

## Phase 6 — Bambu Adapter ✅ (structure) / ⚠️ (unverified)

Full `BambuP1SPrinterAdapter` implementing the shared `PrinterAdapter`
interface, split into isolated modules (config, MQTT connection, MQTT
status parsing, FTPS upload, start-print command, error normalization,
retry policy) exactly as required. Every protocol-specific assumption is
called out in code comments and centralized in
`docs/bambu-integration.md`, which has an ordered physical-verification
checklist and a `pnpm --filter bridge bambu:test-connection` diagnostic
script. **Not claimed production-ready** — this needs a real printer to
verify, which wasn't available while building this.

## Phase 7 — Testing & Deployment ✅ (built) / ⚠️ (partially unverified)

- `apps/web/e2e/queue-flow.spec.ts`: full Playwright scenario matching the
  spec's 14-step lifecycle (admin queues → operator starts → mock bridge
  completes → queue advances → no auto-start). Skipped unless
  `E2E_*` env vars are set, since it needs a live Supabase project + a
  running bridge — not available in this build environment. See
  `docs/testing.md`.
- `apps/bridge/Dockerfile`: multi-stage build producing a small production
  image; `docker-compose.bridge.yml` with `restart: unless-stopped`.
  **Not built/run here** — this sandbox has no Docker daemon. The
  Dockerfile follows standard pnpm-workspace multi-stage patterns; verify
  with a real `docker build` before relying on it.
- Deployment docs for GitHub → Supabase → Vercel → bridge (5 platform
  options: systemd, Docker Compose, Windows Task Scheduler, macOS launchd,
  NAS/Docker).

## Final verification (this environment)

```
pnpm lint        → 4/4 packages pass
pnpm typecheck   → 4/4 packages pass
pnpm test        → 43/43 tests pass across 3 packages
pnpm build       → all 3 packages/apps build successfully
```

Run with placeholder Supabase env vars for the web build (no live project
connected in this environment) — see `docs/testing.md` for what still
needs to be verified against real infrastructure.

## What remains before this is genuinely production-ready

1. **Create a real Supabase project** and run the migrations end-to-end
   (this environment had the Supabase CLI but no Docker, so `supabase db push`
   against a hosted project was never executed here — the SQL has been
   carefully written and reviewed but not run).
2. **Run the DB-level integration tests** listed in `docs/testing.md`
   (atomic claiming under real concurrency, idempotent command creation,
   RLS enforcement, the state-machine trigger) against that project.
3. **Deploy to Vercel** and confirm the production build behaves
   identically to the local one (env vars, middleware auth redirects,
   Storage upload from a real browser).
4. **Run the bridge against the mock adapter** on a real machine on a home
   network, confirm the dashboard shows it online, and run the full
   Playwright e2e test against that live stack.
5. **Work through the Bambu physical-verification checklist**
   (`docs/bambu-integration.md`) before ever setting `PRINTER_ADAPTER=bambu`
   against a print you care about.
6. Replace the placeholder PWA icons (`apps/web/public/icons/`) with real
   artwork.
