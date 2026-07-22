'use client';

import { useEffect } from 'react';

/**
 * Registers /sw.js once, app-wide, independent of whether the user has
 * enabled push notifications yet — a push subscription can't be created
 * without an active service worker registration, and registering early
 * (rather than only from the Settings page) means it's ready the moment
 * someone clicks "Enable notifications". Renders nothing.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').catch((err: unknown) => {
      console.error('Service worker registration failed', err);
    });
  }, []);

  return null;
}
