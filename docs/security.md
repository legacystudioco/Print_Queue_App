# Security

This is a private, two-person household app — the goal here is "correctly
locked down for its actual threat model," not enterprise compliance. Still,
a few things are load-bearing and worth understanding.

## Authentication & authorization

- **No public sign-up.** Accounts are created manually in the Supabase
  dashboard (see `docs/setup-supabase.md`). There is no registration route
  anywhere in the app.
- **Two roles only**: `admin` and `operator`, stored in `app_users.role`.
  A Supabase Auth user with no `app_users` row, or an `app_users` row with
  `active = false`, has zero access — enforced by RLS (`is_active_app_user()`
  in migration `0005_rls.sql`), not just UI-level checks.
- **Session validation happens server-side.** Every Server Component,
  route handler, and Server Action re-derives the current user from the
  request's Supabase session cookie (`getCurrentAppUser()` /
  `requireRole()` in `apps/web/src/lib/server/auth.ts`) — the browser
  never gets to just assert "I'm an admin."
- **Middleware** (`apps/web/src/middleware.ts`) redirects unauthenticated
  requests to `/login` before they ever reach a page, as a first line of
  defense; the per-route checks above are the real enforcement.

## Username-based login (no email UI)

The login screen asks for a **username**, never an email — there is no
email field, confirmation email, magic link, or password-reset email
anywhere in the app. Underneath, Supabase Auth still stores an email per
account, but it's a fixed, non-personal, application-only address
(`<username>@printqueue.local`) that's never sent anywhere and never
shown to the person logging in.

The mapping happens in exactly one place: `apps/web/src/lib/server/username.ts`,
marked `import 'server-only'` so it can never end up in a client bundle.
`POST /api/auth/login` (`apps/web/src/app/api/auth/login/route.ts`) is the
only thing that calls it — the sign-in itself (`supabase.auth.signInWithPassword`)
also happens there, server-side, using the same cookie-writing Supabase
client as the rest of the app. The browser only ever sends the username it
was given; it never learns the internal email, and there's no route that
would let anyone enumerate valid usernames or the mapping in bulk (the
login route is the only consumer, and it never echoes the derived email
back).

Every login failure — malformed username, unknown username, wrong
password — returns the identical `"Invalid username or password"`
message and a `401` (schema-validation failures also get this message, at
`400`). This is deliberate: a distinct "no such user" error would let
someone probe for valid household usernames. The login route is also
rate-limited per normalized username via the same limiter used elsewhere
(`checkRateLimit`).

Usernames are normalized (trimmed, lowercased) before mapping, and
restricted to `[a-z0-9_-]`, 1-32 characters — anything else is treated as
the same generic auth failure rather than a distinct validation error.

## The secret key

`SUPABASE_SECRET_KEY` (Supabase's current naming for what used to be called
the `service_role` key — this project standardizes on the current naming,
see `docs/setup-supabase.md`) bypasses Row Level Security entirely. It is
used in exactly two places:

1. **Next.js route handlers / server code** (`apps/web/src/lib/supabase/admin.ts`,
   marked `import 'server-only'` so it cannot be bundled into client code).
   Every route that uses it (`/api/jobs`, `/api/start-next`, `/api/queue/reorder`,
   etc.) checks the caller's role via `requireRole()` **before** touching
   the admin client — the admin client itself has no idea who's calling,
   so the route is the entire authorization boundary.
2. **The bridge**, which always acts under the secret key because it has no
   concept of a logged-in user — it's a trusted background worker, not a
   multi-tenant client. Its "authorization" is that it only exists inside
   your home network and only you control its `.env` file.

It is never sent to the browser: it's absent from `NEXT_PUBLIC_*` env vars,
never referenced in any Client Component, and Next.js's `server-only`
import guard would throw at build time if it accidentally were.

## Printer credentials

The printer's local access code (`BAMBU_ACCESS_CODE`) lives only in the
bridge's `.env` file — never in the database, never sent to the browser,
never logged. The `printers` table stores operational metadata
(name, status, last-seen) but deliberately has no column for it. If you
ever add printer-settings UI, do not add a credentials field to a
browser-accessible table.

## File storage

- The `print-files` Storage bucket is **private** (see migration
  `0006_storage.sql`) — there is no public URL for any uploaded file.
- Uploads go directly from the admin's browser to Storage (using their own
  session, not the service role) so large files never pass through a
  serverless function's body-size limit. Storage RLS policies restrict
  this to `role = 'admin'` only.
- Downloads (by an admin, from the Job Details page) go through
  `/api/files/[id]/signed-url`, which mints a 60-second signed URL using
  the service role after checking the caller is an admin. The bridge
  downloads files directly via the service role client (it bypasses RLS
  by design, per above).

## Rate limiting

Sensitive routes (`/api/start-next`, `/api/jobs` creation) run through
`checkRateLimit()` (`apps/web/src/lib/server/rate-limit.ts`) — a simple
in-memory sliding window. This is intentionally lightweight: it's a
two-person app on Vercel, and the goal is blunting accidental
double-submits/scripting, not defending against a distributed attacker.
It resets on cold start, which is an accepted tradeoff here.

## Idempotency & double-submit protection

- The Start Next button generates a client-side idempotency key once per
  page load and disables itself after the first submit. Even if a request
  is somehow sent twice, `start_next_print`'s idempotency check (unique
  `idempotency_key` on `printer_commands`) makes the second one a no-op
  that returns the same command rather than creating a duplicate.
- `claim_next_printer_command` uses `SELECT ... FOR UPDATE SKIP LOCKED`,
  so two bridge processes (or a crashed-and-restarted one racing itself)
  can never claim the same command.

## Security headers

`apps/web/next.config.mjs` sets `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, a restrictive `Referrer-Policy`, and a
`Permissions-Policy` disabling camera/mic/geolocation — there's no
legitimate reason for this app to be framed or to request any of those.

## Audit trail

`printer_events` and `bed_clear_confirmations` together give a durable
record of every print start attempt, who confirmed the checklist, and
every status change the bridge observed — visible on each job's Details
page. Nothing here is deleted automatically; see the Storage/history
notes in `docs/troubleshooting.md` for the one place deletion requires
explicit confirmation.

## What this app does NOT try to defend against

Being direct about scope: this is not hardened against a malicious actor
with valid admin credentials (by design — the two account holders are
trusted), doesn't implement audit-log tamper-evidence, and its rate
limiting would not survive a determined attacker with API access. None of
that is the threat model for a private household print queue; if you fork
this for a different context, revisit these assumptions.
