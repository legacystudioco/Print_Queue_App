# Push Notifications

## What this does

When the bridge notices a print has genuinely finished (a real
`printing` → `completed` transition — not a startup blip or a stale
`idle` report), it sends a push notification telling whoever has it
enabled to remove the print and start the next queued job:

> **Print complete**
> "Monsters" has finished. Remove it from the printer and load the next
> job: "Stripes & Helmets".

or, if the queue is empty:

> **Print complete**
> "Monsters" has finished. The queue is now empty.

Tapping the notification opens `/start-next?completedJobId=<id>` — the
Start Next screen, with a small banner confirming which print just
finished.

## Architecture

```
Bambu printer
  │ MQTT status reports
  ▼
Bridge (apps/bridge) — StatusReporter.reconcileJob()
  │ 1. Detects printing → completed (job.status was 'printing';
  │    printer now reports 'completed'). Never fires on startup or a
  │    reconnect-while-idle — see "Why this can't double-fire" below.
  │ 2. Looks up the next queued job (if any) for the message body.
  │ 3. INSERTs into print_job_notifications (service role).
  │    unique(print_job_id, notification_type) makes this insert itself
  │    idempotent — a duplicate attempt just fails harmlessly.
  │ 4. Only if the insert actually created a new row: POSTs
  │    { notificationId } to the web app, authenticated with a shared
  │    secret header (NOT the browser's session, NOT VAPID keys — the
  │    bridge never holds those).
  ▼
POST /api/notifications/dispatch (apps/web)
  │ 1. Validates x-notify-webhook-secret against NOTIFY_WEBHOOK_SECRET.
  │ 2. lib/server/notifications.ts: loads the notification row: if
  │    already dispatched_at, no-op (idempotent here too).
  │ 3. Finds every active app_user with an active push_subscriptions row
  │    whose notification_preferences opts them into this notification
  │    type (missing preferences row → shared's
  │    DEFAULT_NOTIFICATION_PREFERENCES, which defaults print_completed
  │    to on).
  │ 4. lib/server/webPush.ts: VAPID-signs and sends via `web-push` to
  │    each subscription.
  │ 5. 404/410 (subscription gone forever) → push_subscriptions.disabled_at
  │    set. Any other failure → last_failure_at only, subscription stays
  │    active (transient — try again next time).
  │ 6. Marks print_job_notifications.dispatched_at.
  ▼
public/sw.js (every subscribed browser)
  │ 'push' event → self.registration.showNotification(title, {body, data})
  │ 'notificationclick' → focuses an already-open matching tab, or
  │    clients.openWindow(data.url)
  ▼
User taps the notification → /start-next?completedJobId=<id>
```

### Why the bridge doesn't send push itself

The task explicitly avoids it, and the reasoning holds up structurally:
the bridge runs unattended on a home network with only a Supabase
service-role key in its environment. Adding VAPID private keys there
would mean two independent secrets capable of impersonating the backend
living outside the actually-deployed, access-controlled Next.js app.
Routing through `/api/notifications/dispatch` keeps exactly one place
that can sign push messages.

### Why this can't double-fire

`StatusReporter.reconcileJob()` (apps/bridge/src/statusReporter.ts) only
acts when the **job's currently recorded status is `printing`**:

```ts
if (error || !job || job.status !== 'printing') return;
```

- **Bridge startup**: if the printer has no `current_job_id`, `reconcileJob`
  is never called at all.
- **Reconnect while idle**: if `current_job_id` points at a job that's
  already `completed`/`failed`/etc., `job.status !== 'printing'` is true
  and this returns immediately.
- **Repeated "completed" reports** (a real printer keeps reporting
  `completed` on every subsequent poll): the *first* tick already
  transitioned the job out of `printing`, so every later tick's guard
  trips before `recordCompletionNotification` is ever reached.
- **Belt-and-suspenders**: even if some future code path called
  `recordCompletionNotification` twice for the same job, the
  `print_job_notifications` unique constraint on `(print_job_id,
  notification_type)` rejects the second insert (Postgres error `23505`),
  which the bridge treats as "already recorded, nothing to dispatch" —
  not an error.
- **Cancelled / explicitly failed prints**: handled by an entirely
  separate branch (`status.status === 'failed'`) and by
  `handleCancelPrintCommand` in `apps/bridge/src/handlers/simpleCommands.ts`
  — neither touches `print_job_notifications`. `print_failed` and
  `manual_intervention_required` are modeled in the schema and
  preferences (see below) but intentionally not wired up to an actual
  trigger yet, per scope.

See `apps/bridge/src/statusReporter.test.ts` for all of this exercised
directly (idle-at-startup, reconnect-while-idle, repeated reports, a
pre-existing notification row, a printer-reported failure).

## Data model

Three new tables — see `supabase/migrations/0008_notifications.sql` for
the full DDL, comments, indexes, and RLS policies:

- **`push_subscriptions`** — one row per browser/device: `id`, `user_id`,
  `endpoint`, `p256dh`, `auth`, `user_agent`, `created_at`, `updated_at`,
  `disabled_at`, `last_success_at`, `last_failure_at`. RLS: a user can
  select/insert/update/delete only their own rows (`user_id = auth.uid()`).
- **`notification_preferences`** — one row per user:
  `notify_on_print_completed` (default `true`), `notify_on_print_failed`
  (default `false`), `notify_on_manual_intervention` (default `false`).
  Same per-user RLS pattern. A missing row is treated as these defaults —
  the app upserts a row the first time someone visits Settings, nothing
  requires one to exist upfront.
- **`print_job_notifications`** — the idempotent completion record
  described above. Read-only to clients (matches `printer_events`'
  existing convention); only the bridge and the dispatch route (both
  service role) ever write to it.

## Adding `print_failed` / `manual_intervention_required` later

The schema, shared types (`NotificationType`, `notification_preferences`
columns), and dispatch logic (`PREFERENCE_COLUMN` map in
`lib/server/notifications.ts`) already understand all three types — only
the *trigger* is missing for the other two. To add `print_failed`:

1. In `StatusReporter.reconcileJob`'s `status.status === 'failed'` branch,
   call something shaped like `recordCompletionNotification` (rename/
   generalize it) with `notification_type: 'print_failed'` and
   fail-appropriate title/body copy.
2. Nothing else changes — `dispatchPrintJobNotification` already looks up
   `notify_on_print_failed` and sends the same way.

## Testing the pipeline without printing anything

Settings has a **Send Test Notification** button (only shown once
notifications are actually enabled — `capability === 'granted'` in
`NotificationSettings.tsx`) that exercises the real pipeline end to end:
VAPID signing, the push service, and `sw.js`'s `push`/`notificationclick`
handlers, without needing to upload a file and wait for a print.

`POST /api/notifications/test` (`apps/web/src/app/api/notifications/test/route.ts`)
is a normal session-authenticated route (`requireAppUser()`, same as every
other `/api/*` route — not the bridge's shared-secret scheme
`/api/notifications/dispatch` uses) that only ever sends to **the calling
user's own** active `push_subscriptions` rows; there is no way to target
anyone else's. It's rate-limited (5/minute/user) the same way
`/api/start-next` is.

**Sending is not duplicated.** `lib/server/notifications.ts` has one
function that actually talks to a push service and does the
success/failure/auto-disable bookkeeping — `sendPushToSubscriptions()`.
Both `dispatchPrintJobNotification` (production print-completion
notifications) and `sendTestNotificationToUser` (the test button) call it;
neither has its own copy of that loop. The only things that differ between
a real and a test notification are:

- **the payload** — a test send always uses the fixed
  `{ title: '🧪 Test Notification', body: 'Your Print Queue notifications
  are working correctly.', data: { type: 'test', url: '/settings' } }`
  rather than a `print_job_notifications` row's content;
- **which subscriptions it targets** — a test send goes to every one of
  the caller's own subscriptions and deliberately skips the
  `notification_preferences` check (`notify_on_print_completed` etc.) —
  clicking "Send Test Notification" is itself the opt-in, there's no
  automated trigger to gate; and
- **there's no `print_job_notifications` row** — a test send doesn't
  reference a real print job, so there's nothing to mark `dispatched_at`
  on and nothing added to that audit trail.

Everything else — the VAPID-signed call to the push service, marking
`last_success_at`/`last_failure_at`, and disabling (not hard-deleting) a
subscription the push service reports as permanently gone (404/410) — is
the exact same code path a real notification goes through.

The client (`sendTestNotification()` in `lib/client/push.ts`) surfaces
three states on the button itself — `Send Test Notification` →
`Sending…` → `✓ Notification Sent` / `✗ Failed to send notification`
(auto-resets after 4s) — and shows the server's specific error message
underneath on failure: no subscription (404, "enable notifications
first"), an expired one (the request may still report a nonzero
`disabled` count even when it otherwise failed, e.g. if that was the
subscriber's only device — the UI updates the visible device count in
that case), or a generic push-service failure (502).

## Environment variables

Generate a VAPID key pair once per Supabase project:

```bash
npx web-push generate-vapid-keys
```

This prints a public and private key. Then:

**`apps/web/.env.local`** (and the equivalent Vercel Project Environment
Variables):

```bash
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<the public key>
VAPID_PRIVATE_KEY=<the private key>          # server-only, never NEXT_PUBLIC_
VAPID_SUBJECT=mailto:you@example.com          # a mailto: or https: contact URI, required by the push spec
NOTIFY_WEBHOOK_SECRET=<a random secret>       # e.g. `openssl rand -hex 32`
```

**`apps/bridge/.env`** (the machine running the bridge):

```bash
APP_URL=https://your-deployment.example.com   # no trailing slash
NOTIFY_WEBHOOK_SECRET=<the exact same value as above>
```

`APP_URL`/`NOTIFY_WEBHOOK_SECRET` are optional on the bridge — if unset,
completions are still recorded in `print_job_notifications` (so nothing
is lost), just never dispatched. This lets you deploy the schema/bridge
changes before push is fully configured.

`VAPID_PRIVATE_KEY` and `NOTIFY_WEBHOOK_SECRET` must **never** be
prefixed `NEXT_PUBLIC_` or appear in bridge logs/commits — see
`docs/security.md`.

## Deployment steps

1. Run the new migration: `supabase link --project-ref <ref> && supabase db push`
   (or paste `supabase/migrations/0008_notifications.sql` into the SQL
   Editor — see `docs/setup-supabase.md`).
2. Generate VAPID keys (`npx web-push generate-vapid-keys`) and a webhook
   secret (`openssl rand -hex 32`).
3. Set the four web env vars above in Vercel (Project Settings →
   Environment Variables) and redeploy.
4. Set `APP_URL` + `NOTIFY_WEBHOOK_SECRET` in the bridge's `.env` and
   restart the bridge service (`systemctl restart print-queue-bridge` or
   your equivalent — see `docs/setup-bridge.md`).
5. Have each user who wants notifications visit **Settings** in the app
   and tap **Enable notifications** (see iPhone instructions below for
   the extra install step there).

No code changes are needed to go from "schema deployed, push not
configured" to "push fully working" — it's purely the env vars above.

## iPhone / iPad setup

Apple only exposes the Web Push API to a site running as an **installed
Home Screen app** (standalone display mode) — not in a regular Safari
tab. The Settings page detects this and shows "Install the app to enable
notifications" instead of a non-functional Enable button when it applies.
Exact steps for a user:

1. Open the app in **Safari** (not Chrome/Firefox on iOS — they all use
   Apple's WebKit and share this same limitation).
2. Tap the **Share** icon (square with an arrow pointing up).
3. Scroll down and tap **Add to Home Screen**, then **Add**.
4. Close Safari and open the app from the **icon now on your Home
   Screen** — not from Safari.
5. Sign in, go to **Settings**, and tap **Enable notifications**. iOS
   will show its native permission prompt — tap **Allow**.

This matches current Next.js PWA / Web Push best practice generally, not
just an iOS quirk: `Notification.requestPermission()` must be called
from a user gesture (a click handler) everywhere — calling it on page
load is both against spec (silently resolves to `'denied'` in most
browsers with no prompt at all) and bad UX. `NotificationSettings.tsx`
only ever calls it from the "Enable notifications" button's `onClick`.

## Testing

- `apps/bridge/src/statusReporter.test.ts` — completion detection,
  idempotency, startup/reconnect/duplicate/cancelled-print behavior,
  queue-empty vs. named-next-job message text (9 tests).
- `apps/web/src/lib/server/notifications.test.ts` — dispatch fan-out,
  preference defaults/opt-out, deactivated users, already-disabled
  subscriptions, already-dispatched no-op, 404/410 cleanup vs. transient
  failure, plus `sendTestNotificationToUser`: sends to every one of the
  user's own subscriptions and no one else's, ignores
  `notification_preferences`, no-subscription / already-disabled /
  expired-on-send / transient-failure outcomes (15 tests).
- `apps/web/src/lib/client/push.test.ts` — capability detection
  (unsupported / iOS-needs-install / default / granted / denied) as pure,
  input-driven functions (13 tests).
- `apps/web/src/serviceWorker.test.ts` — runs the actual shipped
  `public/sw.js` in a sandboxed Node `vm` context (not a reimplementation)
  to verify `push` shows the right notification and `notificationclick`
  opens/focuses the right URL (5 tests).
- `apps/web/src/components/settings/NotificationSettings.test.tsx` —
  includes the Send Test Notification button's states (hidden until
  granted, sending → sent, sending → failed with the server's message
  shown, and the device count updating when a send reports an expired
  subscription was disabled) (13 tests).

**Not verified in this environment:** an actual push round-trip against
a real browser + push service, and the migration wasn't applied to a
live/local Postgres (no Docker available here — see the PR notes). The
SQL was written to match the exact patterns of the existing, previously-
applied migrations (0001/0002/0005) and reviewed manually; run
`supabase db push` against a real or local project before relying on it
in production.
