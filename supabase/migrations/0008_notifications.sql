-- Web Push notifications.
--
-- Three tables:
--   - push_subscriptions: one row per browser/device a user has enabled
--     push on. Written directly by the browser (RLS-scoped to its own
--     user_id) and by the dispatch route (service role) when cleaning up
--     invalid subscriptions.
--   - notification_preferences: one row per user, which notification
--     types they want. Only `notify_on_print_completed` is acted on today.
--   - print_job_notifications: the idempotent "this completion has been
--     recorded" record the bridge inserts (see
--     apps/bridge/src/statusReporter.ts) and the dispatch route reads and
--     marks dispatched. The unique constraint on (print_job_id,
--     notification_type) is what makes duplicate MQTT reports / bridge
--     retries a no-op instead of a duplicate notification.
--
-- See docs/push-notifications.md for the full flow.

create type notification_type as enum (
  'print_completed',
  'print_failed',
  'manual_intervention_required'
);

-- ---------------------------------------------------------------------------
-- push_subscriptions
-- ---------------------------------------------------------------------------

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disabled_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  unique (user_id, endpoint)
);

comment on table push_subscriptions is
  'Web Push subscriptions (one per browser/device). disabled_at is set '
  'instead of deleting the row when the push service reports the '
  'subscription is gone (404/410) — see the dispatch route.';

create index idx_push_subscriptions_user_id on push_subscriptions (user_id);

-- Partial index: the dispatch route's "who do I send to" query only ever
-- wants active subscriptions, which is the overwhelming majority of scans.
create index idx_push_subscriptions_active on push_subscriptions (user_id) where disabled_at is null;

create trigger trg_push_subscriptions_updated_at
  before update on push_subscriptions
  for each row execute function set_updated_at();

alter table push_subscriptions enable row level security;

create policy "users can view own push subscriptions"
  on push_subscriptions for select
  using (is_active_app_user() and user_id = auth.uid());

create policy "users can insert own push subscriptions"
  on push_subscriptions for insert
  with check (is_active_app_user() and user_id = auth.uid());

create policy "users can update own push subscriptions"
  on push_subscriptions for update
  using (is_active_app_user() and user_id = auth.uid())
  with check (is_active_app_user() and user_id = auth.uid());

create policy "users can delete own push subscriptions"
  on push_subscriptions for delete
  using (is_active_app_user() and user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- notification_preferences
-- ---------------------------------------------------------------------------

create table notification_preferences (
  user_id uuid primary key references app_users (id) on delete cascade,
  notify_on_print_completed boolean not null default true,
  notify_on_print_failed boolean not null default false,
  notify_on_manual_intervention boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table notification_preferences is
  'One row per user. Only notify_on_print_completed currently drives an '
  'actual send (see the dispatch route) — the other two columns exist so '
  'print_failed / manual_intervention_required notifications can be added '
  'without a schema change. A missing row is treated as the column '
  'defaults (see @print-queue/shared DEFAULT_NOTIFICATION_PREFERENCES) — '
  'the app upserts a row the first time a user opens notification settings '
  'rather than requiring one to exist upfront.';

create trigger trg_notification_preferences_updated_at
  before update on notification_preferences
  for each row execute function set_updated_at();

alter table notification_preferences enable row level security;

create policy "users can view own notification preferences"
  on notification_preferences for select
  using (is_active_app_user() and user_id = auth.uid());

create policy "users can insert own notification preferences"
  on notification_preferences for insert
  with check (is_active_app_user() and user_id = auth.uid());

create policy "users can update own notification preferences"
  on notification_preferences for update
  using (is_active_app_user() and user_id = auth.uid())
  with check (is_active_app_user() and user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- print_job_notifications
-- ---------------------------------------------------------------------------

create table print_job_notifications (
  id uuid primary key default gen_random_uuid(),
  print_job_id uuid not null references print_jobs (id) on delete cascade,
  printer_id uuid not null references printers (id) on delete cascade,
  notification_type notification_type not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  dispatched_at timestamptz,
  unique (print_job_id, notification_type)
);

comment on table print_job_notifications is
  'Idempotent record of "this job reached a state worth notifying about". '
  'The bridge inserts these (service role; RLS has no insert policy for '
  'authenticated users on purpose) after a real printing/preparing/paused '
  '-> completed transition — the unique constraint means a duplicate '
  'insert attempt (retry, duplicate MQTT report, reconnect) is a no-op, '
  'not a duplicate notification. dispatched_at is set by the dispatch '
  'route once it has attempted delivery to every subscribed device.';

create index idx_print_job_notifications_print_job_id on print_job_notifications (print_job_id);
create index idx_print_job_notifications_pending on print_job_notifications (created_at) where dispatched_at is null;

alter table print_job_notifications enable row level security;

create policy "active users can view print job notifications"
  on print_job_notifications for select
  using (is_active_app_user());

-- No insert/update/delete policy for authenticated/anon: only the bridge
-- (inserts, via service role) and the dispatch route (updates dispatched_at,
-- via service role) ever write to this table.
