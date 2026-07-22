import { NextResponse } from 'next/server';
import { z } from 'zod';
import { dispatchPrintJobNotification } from '@/lib/server/notifications';
import { getNotifyWebhookSecret } from '@/lib/server/notificationEnv';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const dispatchRequestSchema = z.object({ notificationId: z.string().uuid() });

/**
 * Called only by the bridge (see apps/bridge/src/statusReporter.ts), never
 * by the browser — authenticated with a shared secret header, not a user
 * session. This is the one place VAPID-signed push actually gets sent from;
 * the bridge never holds those credentials. See docs/push-notifications.md.
 */
export async function POST(request: Request) {
  const providedSecret = request.headers.get('x-notify-webhook-secret');
  let expectedSecret: string;
  try {
    expectedSecret = getNotifyWebhookSecret();
  } catch {
    // Not configured — treat identically to a bad secret rather than
    // leaking "push isn't set up yet" to an unauthenticated caller.
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!providedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = dispatchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const result = await dispatchPrintJobNotification(admin, parsed.data.notificationId);
    return NextResponse.json(result);
  } catch (err) {
    console.error('Failed to dispatch print job notification', err);
    return NextResponse.json({ error: 'Dispatch failed' }, { status: 500 });
  }
}
