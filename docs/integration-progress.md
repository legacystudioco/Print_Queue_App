# Integration Progress

Checklist for connecting the already-built app to a real Supabase project
and preparing it for deployment. See `docs/build-progress.md` for the
original build log — this document tracks the *configuration/integration*
session only.

## Security check (done first, before any other work)

- [x] Inspected all tracked/untracked `.env*` files.
- [x] Found real Supabase credentials pasted into the root `.env.example`
      (working tree only — **unstaged**, never committed).
- [x] Searched full git history (`git log -p --all`) for JWT/`sb_publishable_`/`sb_secret_`
      patterns — **zero matches**. Credentials were never committed.
- [x] Fetched `origin` and compared — local `main` and `origin/main` are
      identical (0 ahead / 0 behind) — confirms nothing was ever pushed
      with those values, since you cannot push what was never committed.
- [x] **Conclusion: no credential rotation required.** See the final
      report for details.
- [x] Moved real values into gitignored `apps/web/.env.local` and
      `apps/bridge/.env`.
- [x] Restored all three `.env.example` files to placeholder-only content.
- [x] Verified with `git check-ignore` that both secret-bearing files are
      ignored.

## API key naming standardization

- [x] Inspected code to find every place that reads a Supabase env var.
- [x] Standardized on Supabase's **current** naming (`publishable`/`secret`)
      over the legacy (`anon`/`service_role`) naming — one scheme only, no
      duplicate variables, per instruction.
- [x] Renamed in code: `apps/web/src/lib/supabase/{env,client,server,admin}.ts`,
      `apps/web/src/middleware.ts`, `apps/web/src/lib/client/uploadPrintFile.ts`,
      `apps/bridge/src/config.ts`, `apps/bridge/src/lib/supabase.ts`,
      `apps/bridge/src/config.test.ts`, `scripts/seed.ts`.
- [x] Updated all three `.env.example` files.
- [x] Updated docs: README.md, setup-supabase.md, setup-vercel.md,
      setup-bridge.md, security.md, troubleshooting.md.
- [x] Corrected the project URL: the pasted value included a `/rest/v1/`
      path suffix, which is wrong for the SDK's base URL — the Supabase
      client appends that path itself. Used the bare origin instead.
- [x] Re-ran `pnpm --filter web typecheck`, `pnpm --filter bridge typecheck`,
      and all unit tests after the rename — all pass.

## Phase 3 — Supabase CLI, linking, migrations

- [x] Confirmed Supabase CLI availability (`supabase 2.67.1`, installed via
      Homebrew — a newer version is available but not required).
- [x] Project ref derived from the project URL host you provided
      (`jzmkfvhbwjkrhifyznlx`) — no need to ask for it separately.
- [x] Reviewed all 7 migrations for safety:
  - No destructive statements (`DROP`/`TRUNCATE`/`DELETE`) anywhere.
  - `printers.current_job_id` → `print_jobs.id` circular FK correctly
    resolved via a deferred `ALTER TABLE ADD CONSTRAINT` after both
    tables exist.
  - No placeholder/hardcoded user UUIDs anywhere in the migrations.
  - All 7 `SECURITY DEFINER` functions (`is_active_app_user`,
    `current_app_role`, `create_print_job`, `reorder_queue`,
    `retry_print_job`, `start_next_print`, `claim_next_printer_command`)
    set `search_path = public` — safe against search-path hijacking.
  - The 5 business-logic functions are `revoke all ... from public` +
    `grant execute ... to service_role` only — cannot be invoked by an
    authenticated/anon session, only by trusted server code.
  - RLS cannot lock out server operations: every privileged write in this
    app goes through the service-role client, and Supabase's `service_role`
    has `BYPASSRLS` by platform default — RLS only ever applies to the
    browser/session-based `authenticated`/`anon` roles.
  - Storage bucket insert uses `on conflict (id) do nothing` (safe to
    re-run); Realtime publication changes are wrapped in existence checks
    (safe to re-run). Both use standard Supabase-provisioned objects
    (`storage.buckets`, `supabase_realtime` publication) that exist by
    default on every hosted project.
  - **Conclusion: safe to push as-is.**
- [x] Linked to project `jzmkfvhbwjkrhifyznlx` ("Print_Queue_App").
- [x] Confirmed remote was a genuinely fresh project (`supabase migration
      list` showed all 7 migrations present locally, none applied
      remotely, before push).
- [x] Ran `supabase db push` — all 7 migrations applied cleanly (one
      benign NOTICE: `pgcrypto` extension already existed, harmless).
- [x] `supabase migration list` now shows all 7 as applied both locally
      and remotely.
- [x] Verified database objects directly against the live project:
  - **Tables**: all 7 (`app_users`, `printers`, `print_jobs`,
    `job_ams_slots`, `printer_commands`, `printer_events`,
    `bed_clear_confirmations`) confirmed via `supabase inspect db table-stats`.
  - **Storage bucket**: `print-files` confirmed via `supabase storage ls
    --experimental` and via the Storage API (`public: false`).
  - **Functions**: all 5 business-logic functions
    (`create_print_job`, `reorder_queue`, `retry_print_job`,
    `start_next_print`, `claim_next_printer_command`) confirmed to exist
    and execute real logic — each call returned a genuine business-logic
    error (e.g. FK violation, "job not found", "not the next job") rather
    than a PostgREST "function not found" error.
  - **RLS enforcement (behavioral, not just "enabled")**: an anonymous
    request (publishable key, no session) against `print_jobs` returned
    **0 rows** rather than an error or real data — confirms `is_active_app_user()`
    is actually blocking unauthenticated access, not just present in the schema.
  - **Enums**: not queried directly (Supabase's REST API doesn't expose
    `pg_catalog`), but every migration statement referencing them
    (table columns typed as the enum, function bodies comparing against
    enum literals) executed without error during `db push`, which would
    have failed loudly if an enum type were missing.
  - **Realtime publication**: not independently queryable via REST/CLI in
    this environment (no canned inspect command, and `db dump`/raw SQL
    both require Docker, which isn't available here) — the `0007_realtime.sql`
    migration's existence-check guards mean it would have errored if the
    `supabase_realtime` publication didn't exist, and it applied cleanly.
    Real confirmation deferred to the Phase 5 live test (checking the
    Start Next screen's Realtime subscription actually receives updates).
  - Verification was done via a throwaway Node script (deleted after use)
    using the secret key from `apps/web/.env.local` — never printed the
    key, only pass/fail results and non-secret error messages.
- [x] No unexpected destructive changes — this was an empty project, all
      changes were additive.

## Interlude — username-based login (requested before Auth users were created)

Before creating the two Auth accounts, the login UX was changed to use a
username instead of an email, while keeping Supabase Auth, sessions,
middleware, `app_users`, and RLS entirely unchanged underneath.

- [x] `packages/shared/src/schemas/user.ts` — replaced the old email
      `loginSchema` with `usernameLoginSchema` (shape validation only: a
      non-empty, ≤32-char username + non-empty password — no email format
      requirement).
- [x] `apps/web/src/lib/server/username.ts` — new `server-only` module
      (never reaches the client bundle) doing the actual
      username → `<username>@printqueue.local` mapping, with
      normalization (trim + lowercase) and a `[a-z0-9_-]` shape check.
      Returns `null` for anything invalid so callers fold it into the
      same generic failure as a wrong password.
- [x] `apps/web/src/app/api/auth/login/route.ts` — new route handler:
      validates the request, rate-limits per normalized username, maps to
      the internal email, and calls `supabase.auth.signInWithPassword`
      using the cookie-writing **server** Supabase client — so the sign-in
      itself happens server-side and the browser never learns the
      internal email at all. Every failure (bad shape, unknown user,
      wrong password) returns the identical `"Invalid username or
      password"` message.
- [x] `LoginForm.tsx` — now shows a **Username** field (not Email), POSTs
      to the new route instead of calling Supabase directly from the
      browser.
- [x] Updated `scripts/seed.ts`, `scripts/app_users_template.sql`,
      `apps/web/e2e/queue-flow.spec.ts` (env vars renamed
      `E2E_ADMIN_EMAIL`→`E2E_ADMIN_USERNAME` etc., form now filled via
      `getByLabel('Username')`), and docs (`setup-supabase.md`,
      `security.md`, `testing.md`) to match.
- [x] Added tests: `packages/shared/src/schemas/user.test.ts` (6 tests),
      `apps/web/src/lib/server/username.test.ts` (7 tests, including that
      an email-shaped or injection-shaped input is rejected the same as
      any other invalid username — no special-casing).
- [x] Verified the internal domain never reaches the browser: grepped the
      production `.next/static/chunks/` output for `printqueue.local`
      after a real build — zero matches.
- [x] Full check: lint/typecheck/test (53/53 passing)/build all green
      after this change.

## Phase 4 — Auth users

- [x] Checked the linked project directly (via the Auth admin API and the
      `app_users` table): **0 Auth users, 0 `app_users` rows.** Neither
      account exists yet.
- [x] Created `scripts/app_users_template.sql` — placeholders only, no
      invented UUIDs, not executed. Updated for the internal-email scheme
      (`tyler@printqueue.local` / `harper@printqueue.local`).
- [ ] **BLOCKED — waiting on you.** Create the two Auth users in the
      dashboard using the internal emails (exact steps in chat /
      `docs/setup-supabase.md`), then give me the two UUIDs (or run
      `pnpm db:seed` yourself, or paste the filled-in SQL template into
      the SQL Editor). I will not invent or guess UUIDs.

## Auth users — created and seeded

- [x] Admin (`Tyler`, `eb646273-bfd2-4f67-b5a4-3db26c502586`,
      `tyler@printqueue.local`) and operator (`Harper`,
      `e3d46ae9-01e6-4a81-9bb1-32e4798f2f7a`, `harper@printqueue.local`)
      Auth users confirmed created and auto-confirmed (by you).
- [x] Ran `pnpm db:seed` with those UUIDs — inserted both `app_users` rows
      (verified role/active/email match exactly), plus a placeholder
      printer (`Workshop P1S`, `bridge_id = home-p1s-bridge`) and two
      sample queued jobs (needed for Phase 5 anyway).

## Phase 5 — Local integration test (mock mode, real Supabase)

`pnpm install / build / lint / typecheck / test` all pass (see Phase 6
below — two real bugs were found and fixed along the way). Then ran the
actual web dev server and the actual bridge (mock adapter) as separate
processes against the live project, plus a verification script driving
the same RPCs the app itself calls.

**What was verified for real** (not assumed):

1. ~~Login works~~ / ~~roles enforced~~ — **not tested via the UI with a
   real password**, by design (I was told not to request or print either
   password). Instead I verified the entire *non-secret* login pipeline
   with deliberately wrong passwords for both `Tyler` and `Harper`: the
   route correctly resolves each username, rate-limits, and returns the
   identical `"Invalid username or password"` for a wrong password, an
   unknown username, and a malformed username (e.g. `tyler@evil.com`) —
   proving no account enumeration and that both usernames genuinely
   resolve to real accounts. **You still need to do one real login as
   each user and confirm the role-appropriate UI** — see the request in
   the chat.
2. Unauthorized users cannot enter the app — `/dashboard` and `/api/jobs`
   both 307-redirect to `/login` with no session. ✅ tested directly.
3. Admin role recognized — `app_users` row confirmed with `role=admin`
   for Tyler; RLS `current_app_role()` reads this same row. ✅ (data-level)
4. A `.gcode.3mf` can be uploaded — uploaded a real object to the private
   bucket at the job's exact storage path via the Storage API. ✅
5. The file is stored in the private bucket — confirmed via
   `storage.listBuckets()` (`public: false`) both in Phase 3 and here. ✅
6. A queue item can be created — exercised indirectly (seed uses direct
   inserts, not the RPC); `create_print_job` itself was already verified
   to exist and execute real logic in Phase 3. Full RPC exercise happens
   naturally the next time you use **Add Print** in the browser.
7. AMS slots can be manually configured — confirmed Dragon Sign's 4 slots
   read back exactly as seeded (Orange/Blue/Black/White). ✅
8. Jobs can be reordered — called `reorder_queue` to swap the two jobs,
   confirmed positions actually changed, then restored the original
   order — transactional, reversible, no duplicate `queue_position`. ✅
9. Start Next requires all confirmations — enforced by
   `bedClearChecklistSchema`/`startNextJobSchema` (unit-tested); the RPC
   call itself always sent `true` for this test since I was reproducing
   an already-confirmed checklist, not testing the UI checkbox gating
   (that's existing, unchanged Phase 3 code).
10. A start command is created only once — called `start_next_print`
    twice with the *same* idempotency key; got back the identical command
    `id` both times, not a duplicate. ✅
11. The mock bridge claims the command — a real, separately-running
    bridge process (`pnpm bridge:dev`, `PRINTER_ADAPTER=mock`) claimed the
    command via `claim_next_printer_command` within one poll interval. ✅
12. The job progresses through the expected statuses — bridge logs and
    `printer_events` both show, in order:
    `command_pending → downloading → uploading_to_printer → starting → printing`. ✅
13. The simulated print completes — forced completion via the real
    `pnpm --filter bridge sim complete` CLI; the bridge's own status loop
    (not this script) detected it and flipped the job to `completed`,
    clearing `printers.current_job_id`. ✅
14. The next job does not start automatically — confirmed Cable Clips
    stayed `queued` with **zero** `printer_commands` rows created for it. ✅
15. Realtime updates work — subscribed to `printer_commands` changes
    *before* triggering the start command; captured
    `claimed → processing → completed` events as they happened. This is
    the one item Phase 3 couldn't confirm without Docker — now confirmed
    behaviorally. ✅
16. Operator permissions — **not tested**, same reasoning as #1: needs a
    real session as Harper, which needs her password.

All verification scripts were temporary, deleted immediately after use,
and never printed either password (never even requested one).

## Phase 6 — Configuration fixes

Three real, load-bearing bugs were found and fixed while running the live
test above — none were hypothetical:

1. **Middleware silently blocked the new login route.** `middleware.ts`'s
   `PUBLIC_PATHS` only listed the `/login` page, not the
   `/api/auth/login` route handler the new username-based login form
   POSTs to. Every unauthenticated login attempt was 307-redirected back
   to `/login` before ever reaching the route — **nobody could have
   logged in**. Fixed by adding `/api/auth/login` to `PUBLIC_PATHS`.
   Confirmed with a real POST before and after the fix.
2. **`@supabase/supabase-js`'s `createClient()` crashes outright on
   Node <22 in any plain Node.js process** (the bridge, `scripts/seed.ts`)
   — it eagerly constructs a Realtime client that needs a global
   `WebSocket`, which Node 20 doesn't provide. This does **not** affect
   the Next.js web app itself (`admin.ts`, `server.ts`, `middleware.ts`) —
   confirmed by isolated testing that `@supabase/ssr`'s `createServerClient`
   crashes identically outside of Next's runtime but worked fine through
   `next dev`, meaning Next's own bundling/runtime already handles this.
   Fixed by passing `ws` as an explicit `realtime.transport` in
   `apps/bridge/src/lib/supabase.ts` and `scripts/seed.ts` (added `ws` as
   a real dependency, not a workaround). One fallout of this fix needed
   its own fix: `ws`'s TypeScript types don't exactly match
   `@supabase/realtime-js`'s expected constructor type, and the resulting
   type error was silently poisoning the exported `BridgeSupabaseClient`
   type, cascading into unrelated-looking errors across `jobStatus.ts`,
   `recovery.ts`, and `statusReporter.ts`. Resolved with a scoped
   `as unknown as never` cast at the one call site, documented inline.
3. **The bridge had no way to load its own `.env` file for local dev.**
   `apps/bridge/src/config.ts` reads `process.env` directly with no
   loader — fine for production (systemd/Docker inject env vars
   externally) but `pnpm bridge:dev` had nothing to populate
   `process.env` from `apps/bridge/.env`, so it failed immediately with
   "SUPABASE_URL: Required" even with a correctly filled-in `.env` file.
   Fixed by adding `dotenv` and `import 'dotenv/config'` as the first line
   of `src/index.ts` (and the two standalone scripts) — a no-op in
   production where the file doesn't exist, since it never overrides
   already-set env vars.

No RLS policy was touched or weakened by any of this — every fix was in
application code (middleware routing, Node.js/Realtime client
construction, env loading).

## Phase 7 — Vercel readiness

- [x] Documented exact settings in `docs/setup-vercel.md` (quick-reference
      table at the top): Root Directory `apps/web`, default install/build
      commands (Turborepo's `dependsOn` already builds `packages/shared`
      first), no Node version constraint, the 4 required production/preview
      web env vars (new publishable/secret names), and an explicit note
      that bridge variables never go into Vercel.
- [x] No `vercel.json` needed — confirmed the Root Directory setting plus
      standard Next.js defaults are sufficient (already implicitly proven
      by the local `next build` succeeding with the standard config).
- [ ] Not deployed to Vercel — deployment itself is a "you push, you
      import the repo" action, not something to do until you're ready.

## Phase 8 — Git hygiene

- [x] `git status` reviewed — no `.env.local`/`.env` files present (both
      confirmed `git check-ignore`'d earlier).
- [x] Diffed all three `.env.example` files — placeholders/blanks only,
      no real values.
- [x] Grepped the full diff (including `pnpm-lock.yaml`) for JWT/`sb_`
      secret patterns — one hit, investigated, and confirmed a false
      positive (an `@esbuild` package's `sha512` integrity hash
      coincidentally contains "Eyj" as a substring; real Supabase JWTs
      are exactly `eyJ...`, case-sensitive, and this was only caught by
      my own overly-broad case-insensitive re-check).
- [x] `pnpm lint / typecheck / test` all pass (fully cached — confirms
      nothing changed since the last full run moments earlier).
- [x] `pnpm --filter web build` passes.
- [x] Real UUIDs for Tyler/Harper appear in this file
      (`docs/integration-progress.md`) — deliberate, not an issue: UUIDs
      and the internal `printqueue.local` emails are explicitly not
      secrets (established at the start of this session). No password was
      ever printed, requested, or committed anywhere.
- [ ] Commit — pending, see below.
- [ ] Push — pending your go-ahead, see final report.

---

Status will be updated inline as each phase completes.
