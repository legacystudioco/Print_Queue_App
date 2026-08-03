// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BoardJobWithScreenshotUrl } from '@/lib/server/data';
import { HistoryCard } from './HistoryCard';

function jsonResponse(body: unknown, init: { ok: boolean; status?: number } = { ok: true }) {
  return {
    ok: init.ok,
    status: init.status ?? (init.ok ? 200 : 500),
    json: async () => body,
  } as Response;
}

function makeJob(overrides: Partial<BoardJobWithScreenshotUrl> = {}): BoardJobWithScreenshotUrl {
  return {
    id: 'job-1',
    name: 'Benchy',
    business: '3d_sports_displays',
    status: 'completed',
    screenshotPath: 'job-1/plate.png',
    screenshotUrl: 'https://example.com/job-1/plate.png?token=abc',
    colors: null,
    queuePosition: null,
    parentJobId: null,
    estimatedDurationSeconds: null,
    notes: null,
    createdBy: 'user-1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    completedAt: '2026-01-01T01:00:00Z',
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('HistoryCard — Requeue visibility', () => {
  it('does not render a Requeue button for a non-admin viewer', () => {
    render(<HistoryCard job={makeJob()} creatorName="Alex" isAdmin={false} screenshotAvailable />);
    expect(screen.queryByRole('button', { name: /requeue/i })).toBeNull();
  });

  it('renders an enabled Requeue button for an admin when the screenshot is available', () => {
    render(<HistoryCard job={makeJob()} creatorName="Alex" isAdmin screenshotAvailable />);
    const button = screen.getByRole('button', { name: /requeue/i });
    expect(button).toBeTruthy();
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables the Requeue button and explains why when the screenshot is unavailable', () => {
    render(<HistoryCard job={makeJob()} creatorName="Alex" isAdmin screenshotAvailable={false} />);
    const button = screen.getByRole('button', { name: /requeue/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/original screenshot is no longer available/i)).toBeTruthy();
  });
});

describe('HistoryCard — Requeue action', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs to /api/jobs/:id/requeue and shows the loading then confirmation state', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ job: { id: 'job-2', status: 'queued' } }, { ok: true, status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<HistoryCard job={makeJob()} creatorName="Alex" isAdmin screenshotAvailable />);
    fireEvent.click(screen.getByRole('button', { name: /requeue/i }));

    expect(await screen.findByRole('button', { name: /requeuing/i })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/jobs/job-1/requeue', { method: 'POST' });

    expect(await screen.findByRole('button', { name: /^requeued$/i })).toBeTruthy();
    expect(await screen.findByText(/job added back to the queue\./i)).toBeTruthy();
  });

  it('shows the server error and a failed state when the job is not eligible', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ error: 'Only a completed or partial job can be requeued.' }, { ok: false, status: 409 }),
      ),
    );

    render(<HistoryCard job={makeJob()} creatorName="Alex" isAdmin screenshotAvailable />);
    fireEvent.click(screen.getByRole('button', { name: /requeue/i }));

    expect(await screen.findByRole('button', { name: /failed to requeue/i })).toBeTruthy();
    expect(await screen.findByText(/can be requeued/i)).toBeTruthy();
  });

  it('shows the "screenshot no longer available" error if the server rejects at click time (race with page load)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ error: 'Original screenshot is no longer available.' }, { ok: false, status: 422 }),
      ),
    );

    // Page believed the screenshot was available when it rendered; server re-checks and disagrees.
    render(<HistoryCard job={makeJob()} creatorName="Alex" isAdmin screenshotAvailable />);
    fireEvent.click(screen.getByRole('button', { name: /requeue/i }));

    expect(await screen.findByRole('button', { name: /failed to requeue/i })).toBeTruthy();
    expect(await screen.findByText(/original screenshot is no longer available/i)).toBeTruthy();
  });
});
