-- Template for adding the admin + operator app_users rows.
--
-- DO NOT RUN THIS AS-IS. Replace every <PLACEHOLDER> with a real value
-- copied from Supabase Authentication → Users AFTER creating both
-- accounts there. Never invent UUIDs — they must be the exact `id` shown
-- in the dashboard for each user. See docs/setup-supabase.md for the
-- full walkthrough.
--
-- The app logs in by username, not email (there is no email UI anywhere
-- in this app). Supabase Auth still stores an email per account, so both
-- accounts were created with a fixed, non-personal internal address:
--   Tyler  -> tyler@printqueue.local
--   Harper -> harper@printqueue.local
-- The `email` column below must match exactly what you typed into the
-- dashboard's "Email" field when creating each Auth user.
--
-- Run this in the Supabase SQL Editor (or via `pnpm db:seed`, which does
-- the same thing from the command line with your own env vars).

insert into public.app_users (
  id,
  email,
  display_name,
  role,
  active
)
values
  ('<ADMIN_AUTH_USER_UUID>', 'tyler@printqueue.local', 'Tyler', 'admin', true),
  ('<OPERATOR_AUTH_USER_UUID>', 'harper@printqueue.local', 'Harper', 'operator', true);
