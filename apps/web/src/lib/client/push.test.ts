import { describe, expect, it } from 'vitest';
import { isIosDevice, isStandaloneDisplayMode, resolveNotificationCapability } from './push';

describe('isIosDevice', () => {
  it('detects iPhone by user agent', () => {
    expect(isIosDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'iPhone', 5)).toBe(true);
  });

  it('detects iPad reporting as MacIntel with touch support (iPadOS 13+)', () => {
    expect(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5)).toBe(true);
  });

  it('does not flag a real Mac (MacIntel, no touch points) as iOS', () => {
    expect(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0)).toBe(false);
  });

  it('does not flag a desktop/Android user agent as iOS', () => {
    expect(isIosDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32', 0)).toBe(false);
    expect(isIosDevice('Mozilla/5.0 (Linux; Android 14)', 'Linux armv8l', 5)).toBe(false);
  });
});

describe('isStandaloneDisplayMode', () => {
  it('is standalone when the media query matches', () => {
    expect(isStandaloneDisplayMode(true, undefined)).toBe(true);
  });

  it('is standalone when navigator.standalone is true (legacy iOS)', () => {
    expect(isStandaloneDisplayMode(false, true)).toBe(true);
  });

  it('is not standalone when neither signal is true', () => {
    expect(isStandaloneDisplayMode(false, false)).toBe(false);
    expect(isStandaloneDisplayMode(false, undefined)).toBe(false);
  });
});

describe('resolveNotificationCapability', () => {
  const supported = { hasServiceWorker: true, hasPushManager: true, hasNotification: true };

  it('is "unsupported" for a non-iOS browser missing the Push API', () => {
    expect(
      resolveNotificationCapability({
        hasServiceWorker: true,
        hasPushManager: false,
        hasNotification: true,
        isIos: false,
        isStandalone: false,
        permission: undefined,
      }),
    ).toBe('unsupported');
  });

  it('is "ios-install-required" for iOS Safari not running standalone', () => {
    expect(
      resolveNotificationCapability({
        hasServiceWorker: false,
        hasPushManager: false,
        hasNotification: false,
        isIos: true,
        isStandalone: false,
        permission: undefined,
      }),
    ).toBe('ios-install-required');
  });

  it('is "default" for an installed iOS PWA with permission not yet requested', () => {
    expect(
      resolveNotificationCapability({ ...supported, isIos: true, isStandalone: true, permission: 'default' }),
    ).toBe('default');
  });

  it('is "denied" when the API is supported but permission was refused', () => {
    expect(
      resolveNotificationCapability({ ...supported, isIos: false, isStandalone: false, permission: 'denied' }),
    ).toBe('denied');
  });

  it('is "granted" when the API is supported and permission was granted', () => {
    expect(
      resolveNotificationCapability({ ...supported, isIos: false, isStandalone: false, permission: 'granted' }),
    ).toBe('granted');
  });

  it('is "default" when supported but permission has not been requested yet', () => {
    expect(
      resolveNotificationCapability({ ...supported, isIos: false, isStandalone: false, permission: 'default' }),
    ).toBe('default');
  });
});
