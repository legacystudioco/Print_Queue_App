// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BoardJob, BoardPlate } from '@/components/queue/types';
import { HistoryCard } from './HistoryCard';

const routerRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefresh }),
}));

function jsonResponse(body: unknown, init: { ok: boolean; status?: number } = { ok: true }) {
  return {
    ok: init.ok,
    status: init.status ?? (init.ok ? 200 : 500),
    json: async () => body,
  } as Response;
}

function makePlate(overrides: Partial<BoardPlate> = {}): BoardPlate {
  return {
    id: 'plate-1',
    jobId: 'job-1',
    plateName: 'Benchy',
    screenshotPath: 'job-1/plate.png',
    screenshotUrl: 'https://example.com/job-1/plate.png?token=abc',
    colors: null,
    estimatedDurationSeconds: null,
    notes: null,
    status: 'completed',
    parentPlateId: null,
    sortOrder: 1,
    createdAt: '2026-01-01T00:00:00Z',
    completedAt: '2026-01-01T01:00:00Z',
    ...overrides,
  };
}

function makeJob(overrides: Partial<BoardJob> = {}, plates: BoardPlate[] = [makePlate()]): BoardJob {
  return {
    id: 'job-1',
    customerName: 'John Smith',
    business: '3d_sports_displays',
    notes: null,
    queuePosition: null,
    createdBy: 'user-1',
    createdAt: '2026-01-01T00:00:00Z',
    completedAt: '2026-01-01T01:00:00Z',
    plates,
    ...overrides,
  };
}

function expandCard() {
  fireEvent.click(screen.getByRole('button', { name: /expand/i }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('HistoryCard — collapsed summary', () => {
  it('shows the customer name and completed/partial/reprint counts', () => {
    const plates = [
      makePlate({ id: 'p1', plateName: 'Football Name', status: 'completed' }),
      makePlate({ id: 'p2', plateName: 'Football Player', status: 'completed' }),
      makePlate({ id: 'p3', plateName: 'Stand', status: 'partial' }),
      makePlate({ id: 'p4', plateName: 'Stand - Reprint', status: 'completed', parentPlateId: 'p3' }),
    ];
    render(<HistoryCard job={makeJob({}, plates)} creatorName="Alex" isAdmin={false} screenshotAvailableByPath={{}} />);

    expect(screen.getByText('John Smith')).toBeTruthy();
    expect(screen.getByText('Completed: 3 plates')).toBeTruthy();
    expect(screen.getByText('Partial: 1 plate')).toBeTruthy();
    expect(screen.getByText('Reprints: 1')).toBeTruthy();
  });

  it('does not render the plate list until expanded', () => {
    render(<HistoryCard job={makeJob()} creatorName="Alex" isAdmin={false} screenshotAvailableByPath={{}} />);
    expect(screen.queryByText('Benchy')).toBeNull();
  });
});

describe('HistoryCard — Requeue visibility (expanded)', () => {
  it('does not render a Requeue button for a non-admin viewer', () => {
    render(<HistoryCard job={makeJob()} creatorName="Alex" isAdmin={false} screenshotAvailableByPath={{ 'job-1/plate.png': true }} />);
    expandCard();
    expect(screen.queryByRole('button', { name: /requeue/i })).toBeNull();
  });

  it('renders an enabled Requeue button for an admin when the screenshot is available', () => {
    render(<HistoryCard job={makeJob()} creatorName="Alex" isAdmin screenshotAvailableByPath={{ 'job-1/plate.png': true }} />);
    expandCard();
    const button = screen.getByRole('button', { name: /requeue/i });
    expect(button).toBeTruthy();
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables the Requeue button when the screenshot is unavailable', () => {
    render(<HistoryCard job={makeJob()} creatorName="Alex" isAdmin screenshotAvailableByPath={{ 'job-1/plate.png': false }} />);
    expandCard();
    const button = screen.getByRole('button', { name: /requeue/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('HistoryCard — Requeue action', () => {
  it('POSTs to /api/plates/:id/requeue and shows the loading then confirmation state', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ plate: { id: 'plate-2', status: 'queued' } }, { ok: true, status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<HistoryCard job={makeJob()} creatorName="Alex" isAdmin screenshotAvailableByPath={{ 'job-1/plate.png': true }} />);
    expandCard();
    fireEvent.click(screen.getByRole('button', { name: /requeue/i }));

    expect(await screen.findByRole('button', { name: /requeuing/i })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/plates/plate-1/requeue', { method: 'POST' });

    expect(await screen.findByRole('button', { name: /^requeued$/i })).toBeTruthy();
  });

  it('shows the server error when the plate is not eligible', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ error: 'Only a completed or partial plate can be requeued.' }, { ok: false, status: 409 }),
      ),
    );

    render(<HistoryCard job={makeJob()} creatorName="Alex" isAdmin screenshotAvailableByPath={{ 'job-1/plate.png': true }} />);
    expandCard();
    fireEvent.click(screen.getByRole('button', { name: /requeue/i }));

    expect(await screen.findByText(/can be requeued/i)).toBeTruthy();
  });
});
