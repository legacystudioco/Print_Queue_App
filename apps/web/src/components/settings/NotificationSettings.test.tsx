// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationSettings } from './NotificationSettings';

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
