// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationSettings } from './NotificationSettings';

function jsonResponse(body: unknown, init: { ok: boolean; status?: number } = { ok: true }) {
  return {
    ok: init.ok,
    status: init.status ?? (init.ok ? 200 : 500),
    json: async () => body,
  } as Response;
}

const baseProps = {
  userId: 'user-1',
  initialPreferences: {
    notifyOnPrintCompleted: true,
    notifyOnPrintFailed: false,
    notifyOnManualIntervention: false,
  },
};

/** Fully stubs Notification + PushManager + navigator.serviceWorker + matchMedia — a "fully supported" browser. */
function stubFullPushSupport(permission: NotificationPermission = 'default') {
  vi.stubGlobal('Notification', { permission, requestPermission: vi.fn().mockResolvedValue(permission) });
  Object.defineProperty(window, 'PushManager', {
    value: function PushManager() {},
    configurable: true,
    writable: true,
  });
  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      register: vi.fn().mockResolvedValue({}),
      ready: Promise.resolve({ pushManager: { getSubscription: vi.fn().mockResolvedValue(null) } }),
      getRegistration: vi.fn().mockResolvedValue(undefined),
    },
    configurable: true,
    writable: true,
  });
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, 'Notification');
  Reflect.deleteProperty(window, 'PushManager');
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('NotificationSettings — never throws during Server render (no browser globals accessed before mount)', () => {
  it('renders without throwing even with zero browser API stubs in place', () => {
    expect(() =>
      render(<NotificationSettings {...baseProps} vapidConfigured activeDeviceCount={0} />),
    ).not.toThrow();
  });
});

describe('NotificationSettings — capability states', () => {
  it('shows "Notifications are not configured" when the VAPID public key is missing, regardless of browser support', async () => {
    stubFullPushSupport('default');
    render(<NotificationSettings {...baseProps} vapidConfigured={false} activeDeviceCount={0} />);

    expect(await screen.findByText(/notifications are not configured/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /enable notifications/i })).toBeNull();
  });

  it('offers "Enable notifications" when push is fully supported and permission has not been requested', async () => {
    stubFullPushSupport('default');
    render(<NotificationSettings {...baseProps} vapidConfigured activeDeviceCount={0} />);

    expect(await screen.findByRole('button', { name: /enable notifications/i })).toBeTruthy();
  });

  it('shows "Unsupported browser" when Notification is undefined', async () => {
    // Deliberately no stubbing — jsdom has none of Notification/PushManager/navigator.serviceWorker by default.
    render(<NotificationSettings {...baseProps} vapidConfigured activeDeviceCount={0} />);

    expect(await screen.findByText(/unsupported browser/i)).toBeTruthy();
  });

  it('shows "Unsupported browser" when serviceWorker is unavailable even though Notification/PushManager exist', async () => {
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn() });
    Object.defineProperty(window, 'PushManager', {
      value: function PushManager() {},
      configurable: true,
      writable: true,
    });
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    // navigator.serviceWorker intentionally left undefined.

    render(<NotificationSettings {...baseProps} vapidConfigured activeDeviceCount={0} />);

    expect(await screen.findByText(/unsupported browser/i)).toBeTruthy();
  });

  it('shows "Permission denied" when Notification.permission is "denied"', async () => {
    stubFullPushSupport('denied');
    render(<NotificationSettings {...baseProps} vapidConfigured activeDeviceCount={0} />);

    expect(await screen.findByText(/permission denied/i)).toBeTruthy();
  });

  it('renders "0 devices subscribed" (not a crash) when notifications are granted with no existing push subscription', async () => {
    stubFullPushSupport('granted');
    render(<NotificationSettings {...baseProps} vapidConfigured activeDeviceCount={0} />);

    expect(await screen.findByText(/0 devices subscribed/i)).toBeTruthy();
  });

  it('pluralizes correctly for exactly one subscribed device', async () => {
    stubFullPushSupport('granted');
    render(<NotificationSettings {...baseProps} vapidConfigured activeDeviceCount={1} />);

    expect(await screen.findByText(/1 device subscribed/i)).toBeTruthy();
  });
});

describe('NotificationSettings — Send Test Notification', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not offer a test send until the user is actually subscribed (capability !== "granted")', async () => {
    stubFullPushSupport('default');
    render(<NotificationSettings {...baseProps} vapidConfigured activeDeviceCount={0} />);

    await screen.findByRole('button', { name: /enable notifications/i });
    expect(screen.queryByRole('button', { name: /send test notification/i })).toBeNull();
  });

  it('sends a POST to /api/notifications/test and shows the loading then success state', async () => {
    stubFullPushSupport('granted');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ sent: 1, failed: 0, disabled: 0 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<NotificationSettings {...baseProps} vapidConfigured activeDeviceCount={1} />);
    const button = await screen.findByRole('button', { name: /send test notification/i });

    fireEvent.click(button);

    expect(await screen.findByRole('button', { name: /sending/i })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/notifications/test', { method: 'POST' });

    expect(await screen.findByRole('button', { name: /notification sent/i })).toBeTruthy();
  });

  it('shows the server\'s error message and a failed state when there is no active subscription', async () => {
    stubFullPushSupport('granted');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ error: 'No active push subscription found. Enable notifications first.' }, { ok: false, status: 404 }),
      ),
    );

    render(<NotificationSettings {...baseProps} vapidConfigured activeDeviceCount={1} />);
    fireEvent.click(await screen.findByRole('button', { name: /send test notification/i }));

    expect(await screen.findByRole('button', { name: /failed to send notification/i })).toBeTruthy();
    expect(await screen.findByText(/no active push subscription found/i)).toBeTruthy();
  });

  it('shows a failed state on a generic push send failure', async () => {
    stubFullPushSupport('granted');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { error: 'The push service could not deliver the test notification. Try again in a moment.' },
            { ok: false, status: 502 },
          ),
        ),
    );

    render(<NotificationSettings {...baseProps} vapidConfigured activeDeviceCount={1} />);
    fireEvent.click(await screen.findByRole('button', { name: /send test notification/i }));

    expect(await screen.findByRole('button', { name: /failed to send notification/i })).toBeTruthy();
    expect(await screen.findByText(/could not deliver/i)).toBeTruthy();
  });

  it('reduces the visible device count when the send reports a disabled (expired) subscription was auto-removed', async () => {
    stubFullPushSupport('granted');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ sent: 0, failed: 0, disabled: 1 }, { ok: false, status: 502 })));

    render(<NotificationSettings {...baseProps} vapidConfigured activeDeviceCount={2} />);
    expect(await screen.findByText(/2 devices subscribed/i)).toBeTruthy();

    fireEvent.click(await screen.findByRole('button', { name: /send test notification/i }));

    await screen.findByRole('button', { name: /failed to send notification/i });
    expect(await screen.findByText(/1 device subscribed/i)).toBeTruthy();
  });
});
