import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

// public/sw.js is a plain, unbundled script (service workers are
// registered by URL, and iOS Safari is picky about anything fancier) — so
// it can't be `import`ed like normal app code. Running its source in a
// sandboxed vm context with a minimal fake `self` lets these tests exercise
// the actual shipped file instead of a parallel reimplementation of its
// logic.
const swPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/sw.js');
const swSource = readFileSync(swPath, 'utf-8');

type Listener = (event: Record<string, unknown>) => void;

function loadServiceWorker() {
  const listeners: Record<string, Listener> = {};
  const openWindow = vi.fn();
  const matchAll = vi.fn().mockResolvedValue([]);
  const showNotification = vi.fn().mockResolvedValue(undefined);

  const fakeSelf = {
    addEventListener: (type: string, handler: Listener) => {
      listeners[type] = handler;
    },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn().mockResolvedValue(undefined), matchAll, openWindow },
    registration: { showNotification },
    location: { origin: 'https://queue.example.com' },
  };

  vm.runInContext(swSource, vm.createContext({ self: fakeSelf, URL, console }));

  return { listeners, openWindow, matchAll, showNotification };
}

/** Captures whatever promise the handler passes to event.waitUntil() and awaits it. */
async function fireAndWait(listeners: Record<string, Listener>, eventName: string, event: Record<string, unknown>) {
  const listener = listeners[eventName];
  if (!listener) throw new Error(`sw.js never registered a "${eventName}" listener`);

  let captured: Promise<unknown> = Promise.resolve();
  listener({ ...event, waitUntil: (p: Promise<unknown>) => { captured = p; } });
  await captured;
}

describe('sw.js — push event', () => {
  it('shows a notification using the payload title/body/data', async () => {
    const { listeners, showNotification } = loadServiceWorker();

    await fireAndWait(listeners, 'push', {
      data: {
        json: () => ({
          title: 'Print complete',
          body: '"Monsters" has finished. Remove it from the printer and load the next job: "Stripes & Helmets".',
          data: { jobId: 'job-1', url: '/jobs/job-1', type: 'job_completed' },
        }),
      },
    });

    expect(showNotification).toHaveBeenCalledWith(
      'Print complete',
      expect.objectContaining({
        body: '"Monsters" has finished. Remove it from the printer and load the next job: "Stripes & Helmets".',
        data: { jobId: 'job-1', url: '/jobs/job-1', type: 'job_completed' },
        tag: 'job-job-1',
      }),
    );
  });

  it('does not throw when the push event carries no data', async () => {
    const { listeners, showNotification } = loadServiceWorker();
    await fireAndWait(listeners, 'push', { data: null });
    expect(showNotification).toHaveBeenCalledWith('Print Queue', expect.objectContaining({ body: '' }));
  });
});

describe('sw.js — notificationclick event', () => {
  it('opens the notification data.url when no matching tab is already open', async () => {
    const { listeners, openWindow, matchAll } = loadServiceWorker();
    matchAll.mockResolvedValue([]);
    const close = vi.fn();

    await fireAndWait(listeners, 'notificationclick', {
      notification: { data: { url: '/jobs/job-1' }, close },
    });

    expect(close).toHaveBeenCalled();
    expect(openWindow).toHaveBeenCalledWith('/jobs/job-1');
  });

  it('focuses an already-open tab on the same page instead of opening a new one', async () => {
    const { listeners, openWindow, matchAll } = loadServiceWorker();
    const focus = vi.fn();
    matchAll.mockResolvedValue([{ url: 'https://queue.example.com/jobs/job-1', focus }]);

    await fireAndWait(listeners, 'notificationclick', {
      notification: { data: { url: '/jobs/job-1' }, close: vi.fn() },
    });

    expect(focus).toHaveBeenCalled();
    expect(openWindow).not.toHaveBeenCalled();
  });

  it('falls back to /queue when the notification has no url', async () => {
    const { listeners, openWindow, matchAll } = loadServiceWorker();
    matchAll.mockResolvedValue([]);

    await fireAndWait(listeners, 'notificationclick', {
      notification: { data: {}, close: vi.fn() },
    });

    expect(openWindow).toHaveBeenCalledWith('/queue');
  });
});
