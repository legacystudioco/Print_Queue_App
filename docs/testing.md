# Testing

## What's automated (`pnpm test`)

Runs Vitest across every package via Turborepo:

- **`packages/shared`**
  - `state-machine.test.ts` — every legal transition in
    `canTransitionJobStatus`, plus the illegal ones explicitly called out
    in the spec (`completed -> printing`, `skipped -> starting`,
    `printing -> queued`, terminal states rejecting everything).
  - `schemas/job.test.ts` — filename/extension validation, file-size
    limits, the "at least one AMS slot used unless external spool
    confirmed" rule, per-slot color requirement.
  - `schemas/checklist.test.ts` — the bed-clear checklist and Start Next
    request schemas reject anything incomplete.
  - `schemas/user.test.ts` — the username login request shape (trims
    whitespace, rejects empty/over-length usernames, does **not** require
    an email shape — this is deliberately not the old email schema).
- **`apps/web`**
  - `lib/server/rate-limit.test.ts` — window/limit/reset behavior of the
    sensitive-route rate limiter.
  - `lib/server/username.test.ts` — the username→internal-email mapping:
    case-insensitivity, whitespace trimming, the two real household
    mappings (`Tyler`/`Harper`), and rejection of anything outside
    `[a-z0-9_-]` (including an injection-shaped input, just to document
    the boundary — it's rejected the same as any other invalid shape,
    not specially detected).
- **`apps/bridge`**
  - `config.test.ts` — env var validation, including the
    PRINTER_ADAPTER=bambu-requires-extra-vars rule.
  - `jobStatus.test.ts` — `transitionJobStatus` refuses illegal
    transitions without touching the database, and surfaces DB errors.
  - `printers/mock/MockPrinterAdapter.test.ts` — the full simulated
    lifecycle: idle → printing → natural completion, forced
    complete/fail, offline behavior, pause/resume progress preservation,
    cancel.

Run everything: `pnpm test`. Run one package: `pnpm --filter <name> test`.

## What requires a live Supabase project (not run in this repo's sandbox)

A few of the spec's required test areas live in Postgres functions
(`supabase/migrations/0004_functions.sql`) — atomic command claiming,
idempotent command creation, transactional reorder — and in RLS policies.
These genuinely need a running Postgres instance to exercise honestly;
faking them with a mocked client would just be testing the mock. This
environment didn't have Docker available to run `supabase start` locally,
so they have **not** been executed here. To run them for real:

```bash
supabase start                 # local Postgres + Auth + Storage via Docker
supabase db reset              # applies all migrations + seed
```

Recommended coverage to add once you have that running (pgTAP, or plain
`psql`/a Node script against the local instance):

- **Atomic command claiming**: spawn two concurrent calls to
  `claim_next_printer_command` for the same printer/bridge with one
  pending command queued; assert exactly one succeeds and the other
  returns no rows.
- **Idempotent command creation**: call `start_next_print` twice with the
  same `idempotency_key`; assert the second call returns the same command
  row rather than creating a second one.
- **Duplicate command prevention**: with an active command already
  `pending`/`claimed`/`processing`, call `start_next_print` again for the
  same or a different job; assert it raises.
- **Transactional reorder**: call `reorder_queue` with a job list that
  doesn't match the current active queue; assert it raises and nothing
  changed. Call it with a valid permutation; assert positions update
  atomically with no duplicate `queue_position` values.
- **RLS**: as an `operator`-role session, attempt to `insert`/`update`/`delete`
  `print_jobs` directly (bypassing the API routes) and assert it's denied;
  as an inactive `app_users` row, assert every table is unreadable.
- **State-machine trigger**: attempt `update print_jobs set status = 'printing' where status = 'completed'`
  directly in SQL and assert it raises (this is the DB-level twin of the
  TypeScript state-machine test above, and is the one place a "the app
  would never do that" bug can't help you — a stray migration or manual
  fix could).

## End-to-end test (`pnpm test:e2e`)

`apps/web/e2e/queue-flow.spec.ts` implements the full scenario from the
spec: admin queues two jobs with AMS instructions, operator completes the
checklist and starts the first, a running bridge (mock adapter) carries it
to completion, the queue advances, and no second print auto-starts.

This test is **skipped by default** — it needs infrastructure this
environment doesn't have: a live Supabase project seeded with a real admin
and operator account, and a bridge process already running against that
project in mock mode. To run it for real:

```bash
# 1. Have a Supabase project with migrations applied and both accounts seeded
#    (docs/setup-supabase.md), and apps/web/.env.local pointing at it.
# 2. In one terminal:
pnpm --filter web dev

# 3. In another terminal, start the bridge in mock mode against the same project:
cd apps/bridge && cp .env.example .env   # PRINTER_ADAPTER=mock, real Supabase creds
pnpm --filter bridge dev

# 4. In a third terminal (usernames, not the internal emails behind them):
E2E_ADMIN_USERNAME=Tyler E2E_ADMIN_PASSWORD=... \
E2E_OPERATOR_USERNAME=Harper E2E_OPERATOR_PASSWORD=... \
pnpm --filter web test:e2e
```

The test itself calls `pnpm --filter bridge sim complete` partway through
to force the mock print to finish immediately rather than waiting out its
full simulated duration.

## Manual verification checklist (used during development)

Since not everything above could be executed in this environment, here is
what was actually run and confirmed during the build of this app:

- [x] `pnpm --filter @print-queue/shared build/lint/typecheck/test`
- [x] `pnpm --filter web lint/typecheck/build/test`
- [x] `pnpm --filter bridge lint/typecheck/build/test`
- [ ] Full Supabase migration apply against a real project
- [ ] End-to-end Playwright scenario against a live Supabase + bridge
- [ ] Bambu P1S physical hardware verification (see `docs/bambu-integration.md`)

The unchecked items require infrastructure (a Supabase project, Docker,
and/or physical hardware) not available in the environment this app was
built in, and are the concrete next steps before calling this
production-ready — see `docs/build-progress.md` for the full list.
