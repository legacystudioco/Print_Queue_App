import { describe, expect, it, vi } from 'vitest';
import { dispatchPrintJobNotification, sendTestNotificationToUser } from './notifications';
import { createFakeSupabaseAdmin } from './testSupport/fakeSupabaseAdmin';

const NOTIFICATION_ID = 'notification-1';
const USER_ID = 'user-1';

function seedNotification(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: NOTIFICATION_ID,
    print_job_id: 'job-1',
    printer_id: 'printer-1',
    notification_type: 'print_completed',
    title: 'Print complete',
    body: '"Monsters" has finished. The queue is now empty.',
    data: { type: 'print_completed', completedJobId: 'job-1' },
    dispatched_at: null,
    ...overrides,
  };
}

function seedSubscription(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'sub-1',
    user_id: USER_ID,
    endpoint: 'https://push.example.com/abc',
    p256dh: 'p256dh-key',
    auth: 'auth-key',
    disabled_at: null,
    last_success_at: null,
    last_failure_at: null,
    ...overrides,
  };
}

describe('dispatchPrintJobNotification', () => {
  it('sends to an active, opted-in subscriber and marks the notification dispatched', async () => {
    const { client, tables } = createFakeSupabaseAdmin({
      app_users: [{ id: USER_ID, active: true }],
      push_subscriptions: [seedSubscription()],
      print_job_notifications: [seedNotification()],
    });
    const sendPush = vi.fn().mockResolvedValue({ ok: true });

    const result = await dispatchPrintJobNotification(client, NOTIFICATION_ID, sendPush);

    expect(result).toMatchObject({ sent: 1, failed: 0, disabled: 0, alreadyDispatched: false });
    expect(sendPush).toHaveBeenCalledTimes(1);
    const [subArg, payloadArg] = sendPush.mock.calls[0] as [unknown, unknown];
    expect(subArg).toMatchObject({ endpoint: 'https://push.example.com/abc', p256dh: 'p256dh-key', auth: 'auth-key' });
    expect(payloadArg).toMatchObject({ title: 'Print complete' });

    expect(tables.print_job_notifications[0]?.dispatched_at).toBeTruthy();
    expect(tables.push_subscriptions[0]?.last_success_at).toBeTruthy();
  });

  it('defaults to opted-in for print_completed when no preferences row exists', async () => {
    const { client } = createFakeSupabaseAdmin({
      app_users: [{ id: USER_ID, active: true }],
      push_subscriptions: [seedSubscription()],
      notification_preferences: [], // no row at all for this user
      print_job_notifications: [seedNotification()],
    });
    const sendPush = vi.fn().mockResolvedValue({ ok: true });

    const result = await dispatchPrintJobNotification(client, NOTIFICATION_ID, sendPush);

    expect(result.sent).toBe(1);
  });

  it('does not send to a user who has opted out of print-completed notifications', async () => {
    const { client } = createFakeSupabaseAdmin({
      app_users: [{ id: USER_ID, active: true }],
      push_subscriptions: [seedSubscription()],
      notification_preferences: [
        { user_id: USER_ID, notify_on_print_completed: false, notify_on_print_failed: false, notify_on_manual_intervention: false },
      ],
      print_job_notifications: [seedNotification()],
    });
    const sendPush = vi.fn().mockResolvedValue({ ok: true });

    const result = await dispatchPrintJobNotification(client, NOTIFICATION_ID, sendPush);

    expect(result.sent).toBe(0);
    expect(sendPush).not.toHaveBeenCalled();
  });

  it('does not send to a deactivated user even with an active subscription', async () => {
    const { client } = createFakeSupabaseAdmin({
      app_users: [{ id: USER_ID, active: false }],
      push_subscriptions: [seedSubscription()],
      print_job_notifications: [seedNotification()],
    });
    const sendPush = vi.fn().mockResolvedValue({ ok: true });

    const result = await dispatchPrintJobNotification(client, NOTIFICATION_ID, sendPush);

    expect(result.sent).toBe(0);
    expect(sendPush).not.toHaveBeenCalled();
  });

  it('does not send to an already-disabled subscription', async () => {
    const { client } = createFakeSupabaseAdmin({
      app_users: [{ id: USER_ID, active: true }],
      push_subscriptions: [seedSubscription({ disabled_at: '2026-01-01T00:00:00Z' })],
      print_job_notifications: [seedNotification()],
    });
    const sendPush = vi.fn().mockResolvedValue({ ok: true });

    const result = await dispatchPrintJobNotification(client, NOTIFICATION_ID, sendPush);

    expect(result.sent).toBe(0);
    expect(sendPush).not.toHaveBeenCalled();
  });

  it('is a no-op if the notification was already dispatched', async () => {
    const { client } = createFakeSupabaseAdmin({
      app_users: [{ id: USER_ID, active: true }],
      push_subscriptions: [seedSubscription()],
      print_job_notifications: [seedNotification({ dispatched_at: '2026-01-01T00:00:00Z' })],
    });
    const sendPush = vi.fn().mockResolvedValue({ ok: true });

    const result = await dispatchPrintJobNotification(client, NOTIFICATION_ID, sendPush);

    expect(result.alreadyDispatched).toBe(true);
    expect(sendPush).not.toHaveBeenCalled();
  });

  it('disables a subscription on a permanent (404/410) push failure', async () => {
    const { client, tables } = createFakeSupabaseAdmin({
      app_users: [{ id: USER_ID, active: true }],
      push_subscriptions: [seedSubscription()],
      print_job_notifications: [seedNotification()],
    });
    const sendPush = vi.fn().mockResolvedValue({ ok: false, statusCode: 410 });

    const result = await dispatchPrintJobNotification(client, NOTIFICATION_ID, sendPush);

    expect(result).toMatchObject({ sent: 0, disabled: 1 });
    expect(tables.push_subscriptions[0]?.disabled_at).toBeTruthy();
  });

  it('does not disable a subscription on a transient push failure', async () => {
    const { client, tables } = createFakeSupabaseAdmin({
      app_users: [{ id: USER_ID, active: true }],
      push_subscriptions: [seedSubscription()],
      print_job_notifications: [seedNotification()],
    });
    const sendPush = vi.fn().mockResolvedValue({ ok: false, statusCode: 503 });

    const result = await dispatchPrintJobNotification(client, NOTIFICATION_ID, sendPush);

    expect(result).toMatchObject({ sent: 0, failed: 1, disabled: 0 });
    expect(tables.push_subscriptions[0]?.disabled_at).toBeFalsy();
    expect(tables.push_subscriptions[0]?.last_failure_at).toBeTruthy();
  });
});

describe('sendTestNotificationToUser', () => {
  it('sends a test payload to every active subscription the user owns', async () => {
    const { client, tables } = createFakeSupabaseAdmin({
      push_subscriptions: [seedSubscription(), seedSubscription({ id: 'sub-2', endpoint: 'https://push.example.com/xyz' })],
    });
    const sendPush = vi.fn().mockResolvedValue({ ok: true });

    const result = await sendTestNotificationToUser(client, USER_ID, sendPush);

    expect(result).toMatchObject({ hasSubscriptions: true, sent: 2, failed: 0, disabled: 0 });
    expect(sendPush).toHaveBeenCalledTimes(2);
    const [, payloadArg] = sendPush.mock.calls[0] as [unknown, { title: string; body: string; data: unknown }];
    expect(payloadArg).toMatchObject({
      title: '🧪 Test Notification',
      body: 'Your Print Queue notifications are working correctly.',
      data: { type: 'test', url: '/settings' },
    });
    expect(tables.push_subscriptions.every((s) => s.last_success_at)).toBe(true);
  });

  it('only sends to the given user\'s own subscriptions, never another user\'s', async () => {
    const { client } = createFakeSupabaseAdmin({
      push_subscriptions: [
        seedSubscription({ id: 'sub-mine', user_id: USER_ID }),
        seedSubscription({ id: 'sub-someone-elses', user_id: 'other-user', endpoint: 'https://push.example.com/other' }),
      ],
    });
    const sendPush = vi.fn().mockResolvedValue({ ok: true });

    await sendTestNotificationToUser(client, USER_ID, sendPush);

    expect(sendPush).toHaveBeenCalledTimes(1);
    const [subArg] = sendPush.mock.calls[0] as [{ endpoint: string }];
    expect(subArg.endpoint).toBe('https://push.example.com/abc');
  });

  it('reports hasSubscriptions: false and sends nothing when the user has no active subscription', async () => {
    const { client } = createFakeSupabaseAdmin({ push_subscriptions: [] });
    const sendPush = vi.fn().mockResolvedValue({ ok: true });

    const result = await sendTestNotificationToUser(client, USER_ID, sendPush);

    expect(result).toEqual({ hasSubscriptions: false, sent: 0, failed: 0, disabled: 0 });
    expect(sendPush).not.toHaveBeenCalled();
  });

  it('ignores an already-disabled subscription, same as production dispatch', async () => {
    const { client } = createFakeSupabaseAdmin({
      push_subscriptions: [seedSubscription({ disabled_at: '2026-01-01T00:00:00Z' })],
    });
    const sendPush = vi.fn().mockResolvedValue({ ok: true });

    const result = await sendTestNotificationToUser(client, USER_ID, sendPush);

    expect(result).toEqual({ hasSubscriptions: false, sent: 0, failed: 0, disabled: 0 });
    expect(sendPush).not.toHaveBeenCalled();
  });

  it('auto-disables (removes) an expired/invalid subscription on a 410 response, via the shared send path', async () => {
    const { client, tables } = createFakeSupabaseAdmin({
      push_subscriptions: [seedSubscription()],
    });
    const sendPush = vi.fn().mockResolvedValue({ ok: false, statusCode: 410 });

    const result = await sendTestNotificationToUser(client, USER_ID, sendPush);

    expect(result).toMatchObject({ hasSubscriptions: true, sent: 0, disabled: 1 });
    expect(tables.push_subscriptions[0]?.disabled_at).toBeTruthy();
  });

  it('does not consult notification_preferences at all — a test send is explicit, not an automated opt-in', async () => {
    const { client } = createFakeSupabaseAdmin({
      push_subscriptions: [seedSubscription()],
      notification_preferences: [
        {
          user_id: USER_ID,
          notify_on_print_completed: false,
          notify_on_print_failed: false,
          notify_on_manual_intervention: false,
        },
      ],
    });
    const sendPush = vi.fn().mockResolvedValue({ ok: true });

    const result = await sendTestNotificationToUser(client, USER_ID, sendPush);

    expect(result.sent).toBe(1);
    expect(sendPush).toHaveBeenCalledTimes(1);
  });

  it('reports a transient failure without disabling the subscription', async () => {
    const { client, tables } = createFakeSupabaseAdmin({
      push_subscriptions: [seedSubscription()],
    });
    const sendPush = vi.fn().mockResolvedValue({ ok: false, statusCode: 503 });

    const result = await sendTestNotificationToUser(client, USER_ID, sendPush);

    expect(result).toMatchObject({ hasSubscriptions: true, sent: 0, failed: 1, disabled: 0 });
    expect(tables.push_subscriptions[0]?.disabled_at).toBeFalsy();
  });
});
