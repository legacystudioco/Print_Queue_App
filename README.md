# Print Queue

A private, family-only web app for queuing and running sliced prints on a
Bambu Lab P1S — from a phone, from anywhere, without exposing the printer
to the internet.

## What it does

- Upload already-sliced `.gcode.3mf` files and queue them up.
- Manually record the expected AMS slot colors/materials for each print
  (no automatic color detection — a person verifies the physical AMS
  setup before every print, by design).
- See the current print, the next print, and the rest of the queue from
  any device.
- Before starting the next print, walk through a three-item safety
  checklist (previous print removed, plate clear, AMS verified) — the
  Start button is disabled until all three are checked.
- A small service running at home (the "bridge") watches for start
  commands, downloads the file from private storage, pushes it to the
  printer, and reports status back — so the web app can live on Vercel
  while the printer stays fully inside the home network.
- Two roles: **admin** (upload, edit, reorder, delete, retry) and
  **operator** (view, confirm checklist, start next, view history).

## Architecture

```
Phone/laptop → Next.js app (Vercel) → Supabase (Auth, Postgres, Storage, Realtime)
                                              ↕ (polled by, service-role only)
                                        Home bridge (Node.js, on your LAN)
                                              ↕ (MQTTS + FTPS, local network only)
                                        Bambu Lab P1S
```

Full details in [`docs/architecture.md`](docs/architecture.md).

## Monorepo layout

```
apps/
  web/      Next.js 15 App Router app, deployed to Vercel
  bridge/   Node.js service that runs at home and talks to the printer
packages/
  shared/   Zod schemas, TS types, and the print-job state machine —
            imported by both web and bridge
supabase/
  migrations/   SQL schema, RLS policies, Postgres functions
docs/           Architecture, setup, security, troubleshooting, testing
scripts/        DB seed helper
```

## Local setup (mock mode — no physical printer needed)

```bash
pnpm install
pnpm build              # builds packages/shared first (Turborepo handles the order)

# Supabase: create a project, run migrations, create the two accounts —
# see docs/setup-supabase.md. Then:
cp apps/web/.env.example apps/web/.env.local        # fill in your Supabase project values
cp apps/bridge/.env.example apps/bridge/.env         # fill in the same project's URL + service key

pnpm dev                       # starts the web app (apps/web) on :3000
pnpm bridge:dev                # in another terminal — starts the bridge, PRINTER_ADAPTER=mock by default
```

Log in with the admin account, upload a test file, queue it with AMS
instructions, then log in as the operator (or the same account) and use
the Start Next screen. The mock bridge simulates the entire upload →
start → print → complete lifecycle without any physical hardware. Poke it
from another terminal:

```bash
cd apps/bridge
pnpm sim complete     # force the current simulated print to finish now
pnpm sim fail "nozzle jam"
pnpm sim offline / pnpm sim online
pnpm sim reset
```

## Deployment sequence

1. **Supabase** — create project, run migrations, create bucket
   (automatic via migration), create the two Auth accounts, seed
   `app_users`. See [`docs/setup-supabase.md`](docs/setup-supabase.md).
2. **GitHub** — push this repo.
3. **Vercel** — import the repo, set Root Directory to `apps/web`, add env
   vars, deploy. See [`docs/setup-vercel.md`](docs/setup-vercel.md).
4. **Home bridge** — run it on a machine on the same network as the
   printer (systemd, Docker, launchd, Windows Task Scheduler, or a NAS —
   see [`docs/setup-bridge.md`](docs/setup-bridge.md)).
5. Only once the mock adapter has been exercised end-to-end and you've
   worked through [`docs/bambu-integration.md`](docs/bambu-integration.md)'s
   verification checklist, switch `PRINTER_ADAPTER=bambu` and point it at
   the real printer.

## Environment variables

See `.env.example` at the root, `apps/web/.env.example`, and
`apps/bridge/.env.example` for the full annotated list. Summary:

**Web** (`apps/web/.env.local`): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only,
never exposed to the browser), `APP_URL`.

**Bridge** (`apps/bridge/.env`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`BRIDGE_ID`, `PRINTER_ADAPTER` (`mock` | `bambu`), `BAMBU_PRINTER_IP` /
`BAMBU_PRINTER_SERIAL` / `BAMBU_ACCESS_CODE` / `BAMBU_DEVICE_NAME` (bambu
mode only), `COMMAND_POLL_INTERVAL_MS`, `HEARTBEAT_INTERVAL_MS`,
`TEMP_DIRECTORY`, `LOG_LEVEL`.

## Common commands

```bash
pnpm install        # install everything
pnpm dev             # run the web app
pnpm build           # build all packages/apps (in dependency order)
pnpm lint            # lint everything
pnpm typecheck       # typecheck everything
pnpm test            # unit tests (Vitest) across all packages
pnpm test:e2e        # Playwright e2e — needs live Supabase + a running bridge, see docs/testing.md
pnpm db:types        # regenerate apps/web/src/lib/supabase/database.types.ts from a real project
pnpm db:seed         # seed app_users/printer/sample jobs (see docs/setup-supabase.md)
pnpm bridge:dev       # run the bridge with hot reload
pnpm bridge:start     # run the bridge's compiled build
```

## Current limitations

- **The Bambu P1S adapter is structurally complete but unverified against
  physical hardware** — it's built from community-documented local
  MQTT/FTPS behavior, not an official API. See
  [`docs/bambu-integration.md`](docs/bambu-integration.md) for exactly
  what to check before trusting it with a real print. Use
  `PRINTER_ADAPTER=mock` until you have.
- **Some required tests need live infrastructure** (a Supabase project,
  Docker for local Postgres, physical hardware) not available while this
  was built. What's automated vs. what still needs to be run manually is
  itemized in [`docs/testing.md`](docs/testing.md).
- **Rate limiting is in-memory per server instance** — adequate for a
  two-person household app on Vercel, not a distributed rate limiter. See
  [`docs/security.md`](docs/security.md).
- **No in-app user management UI.** Adding a third household member means
  creating their Supabase Auth account and `app_users` row manually — see
  `docs/setup-supabase.md`. This is intentional, not a gap: the spec
  explicitly asks for no public registration and no over-built admin UI
  for a two-person app.
- **Single printer assumption.** The schema doesn't hard-code it, but
  nothing in the UI lets you switch between multiple printers.

## Status

See [`docs/build-progress.md`](docs/build-progress.md) for the phase-by-phase
build log and what remains before this is genuinely production-ready.
