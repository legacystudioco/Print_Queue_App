import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/api-errors';
import { requireAppUser } from '@/lib/server/auth';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { sendTestNotificationToUser } from '@/lib/server/notifications';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Lets a signed-in user verify the push pipeline end to end — VAPID
 * signing, delivery, the service worker's `push`/`notificationclick`
 * handlers — without waiting for a real print to finish. Only ever sends
 * to the caller's *own* push_subscriptions rows (never someone else's);
 * see requireAppUser() below and sendTestNotificationToUser's own
 * `.eq('user_id', userId)` filter — there is no way to pass a different
 * user id in from the request. Uses the exact same
 * sendPushToSubscriptions() delivery function as production print-
 * completion notifications (see lib/server/notifications.ts) — the only
 * thing that differs is the payload and which subscriptions it targets.
 */
export async function POST() {
  try {
    const user = await requireAppUser();

    const rate = checkRateLimit(`notifications-test:${user.id}`, { limit: 5, windowMs: 60_000 });
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Too many test notifications, slow down.' }, { status: 429 });
    }

    const admin = createSupabaseAdminClient();
    const result = await sendTestNotificationToUser(admin, user.id);

    if (!result.hasSubscriptions) {
      return NextResponse.json(
        { error: 'No active push subscription found. Enable notifications first.' },
        { status: 404 },
      );
    }

    if (result.sent === 0) {
      const reason =
        result.disabled > 0
          ? 'Your push subscription is no longer valid and has been removed — enable notifications again.'
          : 'The push service could not deliver the test notification. Try again in a moment.';
      console.error('Test notification failed to deliver', { userId: user.id, ...result });
      return NextResponse.json({ error: reason, ...result }, { status: 502 });
    }

    console.info('Test notification sent', { userId: user.id, ...result });
    return NextResponse.json(result);
  } catch (err) {
    console.error('Failed to send test notification', err);
    return handleApiError(err);
  }
}
