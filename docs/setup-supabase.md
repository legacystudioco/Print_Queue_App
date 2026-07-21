# Supabase Setup

## API key naming

Supabase currently offers two parallel key naming schemes for the same
underlying keys:

- **Legacy**: `anon` key (public) / `service_role` key (secret, bypasses RLS)
- **Current**: `publishable` key (public) / `secret` key (secret, bypasses RLS)

Both work identically with the Supabase SDK — it just takes a key string,
it doesn't care which naming scheme issued it. This project standardizes
on the **current** naming (`publishable` / `secret`) everywhere: env var
names, code, and docs. Don't mix in the legacy names.

## 1. Create a project

Create a new project at [supabase.com](https://supabase.com). Note the
project URL, the `publishable` key, and the `secret` key (Project Settings
→ API Keys) — you'll need all three. If your project only shows legacy
`anon`/`service_role` keys, you can still use them (they're accepted the
same way), but this project's variable names assume the current
publishable/secret naming — see the mapping in step 7.

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
- Also disable "Enable email confirmations" — there is no email UI in this
  app (no confirmation emails, magic links, or password-reset emails), and
  the account "emails" aren't real inboxes (see step 4), so confirmation
  can never be completed by clicking a link. Create Auth users with
  **Auto Confirm User** checked instead (see step 4) so they can sign in
  immediately.

## 4. Create the admin and operator accounts

**Do this manually — never via SQL.** Creating `auth.users` rows directly
bypasses Supabase's password-hashing and invariants and is unsupported.

**Important — this app logs in by username, not email.** There is no
email field anywhere in the UI. Supabase Auth still requires an email per
account internally, so both accounts use a fixed, non-personal,
application-only address at `printqueue.local` — nothing is ever sent to
it, it only exists as a stable identifier inside Supabase Auth. The
mapping is fixed in `apps/web/src/lib/server/username.ts`:

| Username (what you type to log in) | Internal Auth email (what you type in the dashboard) | Role |
|---|---|---|
| `Tyler` | `tyler@printqueue.local` | admin |
| `Harper` | `harper@printqueue.local` | operator |

In the Supabase dashboard: **Authentication → Users → Add User**, once for
each account above:

1. **Email**: the internal address from the table above, exactly
   (`tyler@printqueue.local` / `harper@printqueue.local`).
2. **Password**: choose a real, strong password — this is what actually
   protects the account. It has nothing to do with the fake email.
3. Check **Auto Confirm User** (there's no inbox at `printqueue.local` to
   click a confirmation link from).
4. Save, then copy that user's **UUID** from the Users list.

Then add the corresponding `app_users` row for each — either via the
Table Editor, via `scripts/app_users_template.sql` (fill in the two UUIDs,
run in the SQL Editor), or with the seed script:

```bash
SUPABASE_URL=https://your-project.supabase.co \
SUPABASE_SECRET_KEY=your-secret-key \
ADMIN_USER_ID=<uuid-from-dashboard> ADMIN_EMAIL=tyler@printqueue.local \
OPERATOR_USER_ID=<uuid-from-dashboard> OPERATOR_EMAIL=harper@printqueue.local \
pnpm db:seed
```

This also creates a placeholder printer row and two sample queued jobs so
the app isn't empty on first load. Edit the printer row afterward (Table
Editor → `printers`) to set its real `name` and `bridge_id` (this must
match `BRIDGE_ID` in the bridge's `.env` — see `docs/setup-bridge.md`).

To add further users later (there's no in-app user management UI by
design — see `docs/security.md`), pick a new username, repeat the Auth
user creation with `<username>@printqueue.local`, then insert an
`app_users` row with the matching `id`, that same internal email, and the
desired `role`.

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
project URL + publishable key + secret key. Copy `apps/bridge/.env.example`
to `apps/bridge/.env` and fill in the project URL + secret key (the bridge
never uses the publishable key — it always acts as the secret/admin role).

| This project's variable | Supabase dashboard label (current naming) | Legacy equivalent |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL` | Project URL | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key | `anon` key |
| `SUPABASE_SECRET_KEY` | Secret key | `service_role` key |

The project URL must be the bare origin (`https://<ref>.supabase.co`) with
no path suffix — the Supabase SDK appends `/auth/v1`, `/rest/v1`, etc.
itself.
