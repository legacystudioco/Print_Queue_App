// @vitest-environment jsdom
import type { AppUser, PrintJobStatus, PrintJobWithSlots } from '@print-queue/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JobDisplayFlags } from '@/lib/server/data';
import { QueueList } from './QueueList';

const routerRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefresh, push: vi.fn() }),
}));

// QueueList subscribes to Realtime on mount purely as a side effect (see
// requirement 7) — the fake channel just needs to satisfy the chain
// (.channel().on().subscribe()) without touching the network.
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    channel: () => ({
      on: () => ({ subscribe: () => ({}) }),
    }),
    removeChannel: vi.fn(),
  }),
}));

const ADMIN: AppUser = { id: 'user-1', email: 'a@example.com', displayName: 'Alex', role: 'admin', active: true };

type QueueJob = PrintJobWithSlots & JobDisplayFlags;

function makeJob(overrides: Partial<QueueJob> & { id: string }): QueueJob {
  return {
    printerId: 'printer-1',
    name: 'Untitled',
    originalFilename: 'plate.gcode.3mf',
    storagePath: `printer-1/${overrides.id}/plate.gcode.3mf`,
    fileSizeBytes: 1000,
    queuePosition: 1,
    status: 'queued' as PrintJobStatus,
    estimatedDurationSeconds: null,
    notes: null,
    createdBy: 'user-1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    startedAt: null,
    completedAt: null,
    failureMessage: null,
    amsSlots: [],
    manualStartRequired: false,
    failedBeforeUpload: false,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  routerRefresh.mockClear();
});

describe('QueueList — empty queue', () => {
  it('shows the empty state and no time summary when there are no jobs', () => {
    render(<QueueList initialJobs={[]} user={ADMIN} printerId="printer-1" />);
    expect(screen.getByText(/queue is empty/i)).toBeTruthy();
    expect(screen.queryByText(/total queue time/i)).toBeNull();
  });
});

describe('QueueList — Total Queue Time', () => {
  it('sums estimated print time across every waiting job, whether selected or not', () => {
    const jobs = [
      makeJob({ id: 'a', name: 'Job A', estimatedDurationSeconds: 195 * 60 }), // 3h15m
      makeJob({ id: 'b', name: 'Job B', estimatedDurationSeconds: 45 * 60 }), // 45m
      makeJob({ id: 'c', name: 'Job C', estimatedDurationSeconds: 120 * 60 }), // 2h
    ];
    render(<QueueList initialJobs={jobs} user={ADMIN} printerId="printer-1" />);

    expect(screen.getByText(/total queue time/i)).toBeTruthy();
    expect(screen.getByText('6h')).toBeTruthy();
  });

  it('excludes the currently-printing job from Total Queue Time', () => {
    const jobs = [
      makeJob({ id: 'printing', name: 'On the bed', status: 'printing', estimatedDurationSeconds: 600 * 60 }),
      makeJob({ id: 'waiting', name: 'Next up', estimatedDurationSeconds: 60 * 60 }),
    ];
    render(<QueueList initialJobs={jobs} user={ADMIN} printerId="printer-1" />);

    // Only the waiting job's 1h counts — the 10h actively-printing job does not.
    expect(screen.getByText('1h')).toBeTruthy();
  });

  it('excludes completed/failed/cancelled/skipped jobs from the total', () => {
    const jobs = [
      makeJob({ id: 'done', name: 'Done', status: 'completed', estimatedDurationSeconds: 300 * 60 }),
      makeJob({ id: 'gone', name: 'Cancelled', status: 'cancelled', estimatedDurationSeconds: 300 * 60 }),
      makeJob({ id: 'waiting', name: 'Waiting', estimatedDurationSeconds: 30 * 60 }),
    ];
    render(<QueueList initialJobs={jobs} user={ADMIN} printerId="printer-1" />);

    expect(screen.getByText('30m')).toBeTruthy();
  });

  it('notes how many waiting jobs have no estimated print time, without treating them as zero', () => {
    const jobs = [
      makeJob({ id: 'a', name: 'Has estimate', estimatedDurationSeconds: 60 * 60 }),
      makeJob({ id: 'b', name: 'No estimate 1', estimatedDurationSeconds: null }),
      makeJob({ id: 'c', name: 'No estimate 2', estimatedDurationSeconds: null }),
    ];
    render(<QueueList initialJobs={jobs} user={ADMIN} printerId="printer-1" />);

    expect(screen.getByText('1h')).toBeTruthy();
    expect(screen.getByText(/2 jobs have no estimated print time\./i)).toBeTruthy();
  });
});

describe('QueueList — selection', () => {
  it('shows the "select jobs" hint and hides Selected Print Time when nothing is selected', () => {
    const jobs = [makeJob({ id: 'a', name: 'Job A', estimatedDurationSeconds: 60 * 60 })];
    render(<QueueList initialJobs={jobs} user={ADMIN} printerId="printer-1" />);

    expect(screen.getByText(/select jobs to calculate their combined print time/i)).toBeTruthy();
    expect(screen.queryByText(/selected print time/i)).toBeNull();
  });

  it('selects and deselects an individual job, updating Selected Print Time and the count', () => {
    const jobs = [
      makeJob({ id: 'a', name: 'Job A', estimatedDurationSeconds: 195 * 60 }),
      makeJob({ id: 'b', name: 'Job B', estimatedDurationSeconds: 45 * 60 }),
    ];
    render(<QueueList initialJobs={jobs} user={ADMIN} printerId="printer-1" />);

    const checkboxA = screen.getByLabelText('Select Job A for time calculation');
    fireEvent.click(checkboxA);

    expect(screen.getByText(/selected print time/i)).toBeTruthy();
    expect(screen.getByText('3h 15m')).toBeTruthy();
    expect(screen.getByText(/1 job selected/i)).toBeTruthy();

    fireEvent.click(checkboxA);
    expect(screen.queryByText(/selected print time/i)).toBeNull();
  });

  it('sums multiple selected jobs correctly, independent of the overall total', () => {
    const jobs = [
      makeJob({ id: 'a', name: 'Job A', estimatedDurationSeconds: 195 * 60 }),
      makeJob({ id: 'b', name: 'Job B', estimatedDurationSeconds: 45 * 60 }),
      makeJob({ id: 'c', name: 'Job C', estimatedDurationSeconds: 120 * 60 }),
    ];
    render(<QueueList initialJobs={jobs} user={ADMIN} printerId="printer-1" />);

    fireEvent.click(screen.getByLabelText('Select Job A for time calculation'));
    fireEvent.click(screen.getByLabelText('Select Job C for time calculation'));

    expect(screen.getByText(/2 jobs selected/i)).toBeTruthy();
    // 3h15m + 2h = 5h15m, distinct from the 6h grand total.
    expect(screen.getByText('5h 15m')).toBeTruthy();
    expect(screen.getByText('6h')).toBeTruthy();
  });

  it('flags when a selected job has no estimated time, separately from the total note', () => {
    const jobs = [
      makeJob({ id: 'a', name: 'Job A', estimatedDurationSeconds: 60 * 60 }),
      makeJob({ id: 'b', name: 'No estimate', estimatedDurationSeconds: null }),
    ];
    render(<QueueList initialJobs={jobs} user={ADMIN} printerId="printer-1" />);

    fireEvent.click(screen.getByLabelText('Select Job A for time calculation'));
    fireEvent.click(screen.getByLabelText('Select No estimate for time calculation'));

    expect(screen.getByText(/2 jobs selected/i)).toBeTruthy();
    expect(screen.getByText(/1 selected job has no estimated time/i)).toBeTruthy();
  });

  it('Select All selects every waiting job, and Clear Selection deselects them all', () => {
    const jobs = [
      makeJob({ id: 'a', name: 'Job A', estimatedDurationSeconds: 60 * 60 }),
      makeJob({ id: 'b', name: 'Job B', estimatedDurationSeconds: 30 * 60 }),
    ];
    render(<QueueList initialJobs={jobs} user={ADMIN} printerId="printer-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Select All' }));
    expect(screen.getByText(/2 jobs selected/i)).toBeTruthy();
    expect(screen.getByLabelText('Select Job A for time calculation')).toHaveProperty('checked', true);
    expect(screen.getByLabelText('Select Job B for time calculation')).toHaveProperty('checked', true);

    fireEvent.click(screen.getByRole('button', { name: 'Clear Selection' }));
    expect(screen.queryByText(/selected print time/i)).toBeNull();
    expect(screen.getByLabelText('Select Job A for time calculation')).toHaveProperty('checked', false);
  });

  it('does not offer a checkbox for the actively-printing job', () => {
    const jobs = [makeJob({ id: 'printing', name: 'On the bed', status: 'printing' })];
    render(<QueueList initialJobs={jobs} user={ADMIN} printerId="printer-1" />);

    expect(screen.queryByLabelText(/select on the bed for time calculation/i)).toBeNull();
  });
});

describe('QueueList — reacting to queue changes', () => {
  it('recomputes totals when the queue data itself updates (e.g. after a refresh)', () => {
    const jobs = [makeJob({ id: 'a', name: 'Job A', estimatedDurationSeconds: 60 * 60 })];
    const { rerender } = render(<QueueList initialJobs={jobs} user={ADMIN} printerId="printer-1" />);
    expect(screen.getByText('1h')).toBeTruthy();

    const updated = [...jobs, makeJob({ id: 'b', name: 'Job B', estimatedDurationSeconds: 30 * 60 })];
    rerender(<QueueList initialJobs={updated} user={ADMIN} printerId="printer-1" />);

    expect(screen.getByText('1h 30m')).toBeTruthy();
  });

  it('automatically drops a selected job from the selection once it leaves the active queue', () => {
    const jobs = [
      makeJob({ id: 'a', name: 'Job A', estimatedDurationSeconds: 60 * 60 }),
      makeJob({ id: 'b', name: 'Job B', estimatedDurationSeconds: 30 * 60 }),
    ];
    const { rerender } = render(<QueueList initialJobs={jobs} user={ADMIN} printerId="printer-1" />);

    fireEvent.click(screen.getByLabelText('Select Job A for time calculation'));
    fireEvent.click(screen.getByLabelText('Select Job B for time calculation'));
    expect(screen.getByText(/2 jobs selected/i)).toBeTruthy();

    // Job A moved out of the waiting queue (e.g. it started printing) — it should fall out of the selection.
    const afterStart = [
      makeJob({ id: 'a', name: 'Job A', status: 'printing', estimatedDurationSeconds: 60 * 60 }),
      jobs[1]!,
    ];
    rerender(<QueueList initialJobs={afterStart} user={ADMIN} printerId="printer-1" />);

    expect(screen.getByText(/1 job selected/i)).toBeTruthy();
    expect(screen.getByTestId('total-queue-time-value').textContent).toBe('30m');
    expect(screen.getByTestId('selected-print-time-value').textContent).toBe('30m');
  });

  it('clears the selection entirely when the selected job is removed from the queue altogether', () => {
    const jobs = [makeJob({ id: 'a', name: 'Job A', estimatedDurationSeconds: 60 * 60 })];
    const { rerender } = render(<QueueList initialJobs={jobs} user={ADMIN} printerId="printer-1" />);

    fireEvent.click(screen.getByLabelText('Select Job A for time calculation'));
    expect(screen.getByText(/1 job selected/i)).toBeTruthy();

    rerender(<QueueList initialJobs={[]} user={ADMIN} printerId="printer-1" />);
    expect(screen.getByText(/queue is empty/i)).toBeTruthy();
  });
});
