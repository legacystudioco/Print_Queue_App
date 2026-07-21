# Supabase Setup

## 1. Create a project

Create a new project at [supabase.com](https://supabase.com). Note the
project URL, `anon` key, and `service_role` key (Project Settings → API) —
you'll need all three.

## 2. Run the migrations

From the repo root, with the [Supabase CLI](https://supabase.com/docs/guides/cli)
installed and logged in:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

This runs everything in `supabase/migrations/` in order: schema, indexes,
the state-machine trigger, business-logic functions, RLS policies, storage
bucket + policies, and Realtime publication membership.

If you don't have the CLI, you can instead paste each file in
`supabase/migrations/` (in filename order) into the SQL Editor in the
Supabase dashboard and run them one at a time.

## 3. Configure Auth

- Authentication → Providers → Email: enabled (default).
- Authentication → Settings → **disable** "Enable email signups" — there
  is no public registration for this app; accounts are created manually
  (see below).
- Leave "Confirm email" on or off as you prefer for a two-person household
  app; it doesn't affect anything else here.

## 4. Create the admin and operator accounts

**Do this manually — never via SQL.** Creating `auth.users` rows directly
bypasses Supabase's password-hashing and invariants and is unsupported.

In the Supabase dashboard: **Authentication → Users → Add User**, once for
you (admin) and once for whoever else should use the app (operator). Set a
password for each. Copy each user's UUID from the users list.

Then add the corresponding `app_users` row for each — either via the
Table Editor, or with the seed script:

```bash
SUPABASE_URL=https://your-project.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
ADMIN_USER_ID=<uuid-from-dashboard> ADMIN_EMAIL=you@example.com \
OPERATOR_USER_ID=<uuid-from-dashboard> OPERATOR_EMAIL=kid@example.com \
pnpm db:seed
```

This also creates a placeholder printer row and two sample queued jobs so
the app isn't empty on first load. Edit the printer row afterward (Table
Editor → `printers`) to set its real `name` and `bridge_id` (this must
match `BRIDGE_ID` in the bridge's `.env` — see `docs/setup-bridge.md`).

To add further users later (there's no in-app user management UI by
design — see `docs/security.md`), repeat: create the Auth user, then insert
an `app_users` row with the matching `id` and the desired `role`.

## 5. Verify the storage bucket

Migration `0006_storage.sql` creates a private `print-files` bucket and its
RLS policies. Confirm in Storage → Buckets that `print-files` exists and
shows as private (no public URL). You shouldn't need to touch this
manually.

## 6. Realtime

Migration `0007_realtime.sql` adds `printer_commands`, `print_jobs`, and
`printers` to the `supabase_realtime` publication. If you ever need to
re-check this: Database → Replication, confirm those three tables are
listed under the `supabase_realtime` publication.

## 7. Environment variables

Copy `apps/web/.env.example` to `apps/web/.env.local` and fill in the
project URL + anon key + service role key. Copy `apps/bridge/.env.example`
to `apps/bridge/.env` and fill in the project URL + service role key
(the bridge never uses the anon key — it always acts as service role).
