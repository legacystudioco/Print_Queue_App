// @vitest-environment jsdom
import type { AppUser, JobFileRecord, PrinterRecord } from '@print-queue/shared';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueueBoard } from './QueueBoard';
import type { QueueJob } from './types';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => <img {...props} alt={(props.alt as string) ?? ''} />,
}));

const routerRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefresh, push: vi.fn() }),
}));

// QueueBoard subscribes to Realtime on mount purely as a side effect — the
// fake channel just needs to satisfy the chain without touching the network.
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  routerRefresh.mockClear();
});

const ADMIN: AppUser = { id: 'user-1', email: 'a@example.com', displayName: 'Alex', role: 'admin', active: true };

const BAMBU_PRINTER: PrinterRecord = {
  id: 'printer-bambu',
  name: 'Workshop P1S',
  model: 'Bambu Lab P1S',
  brand: 'bambu',
  serialNumber: null,
  localIp: null,
  bridgeId: null,
  status: 'idle',
  lastSeenAt: null,
  currentJobId: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};
const PRINTERS = [BAMBU_PRINTER];
const PRINTER_STATUS = { [BAMBU_PRINTER.id]: { bridgeOnline: true, progressPercent: undefined } };

const SNAPMAKER_PRINTER: PrinterRecord = {
  ...BAMBU_PRINTER,
  id: 'printer-snapmaker',
  name: 'Snapmaker Bench',
  brand: 'snapmaker',
};
const TWO_PRINTERS = [BAMBU_PRINTER, SNAPMAKER_PRINTER];
const TWO_PRINTER_STATUS = {
  [BAMBU_PRINTER.id]: { bridgeOnline: true, progressPercent: undefined },
  [SNAPMAKER_PRINTER.id]: { bridgeOnline: true, progressPercent: undefined },
};

function file(brand: JobFileRecord['printerBrand'], jobId: string): JobFileRecord {
  return {
    id: `file-${jobId}-${brand}`,
    jobId,
    printerBrand: brand,
    filename: `plate.${brand === 'bambu' ? 'gcode.3mf' : 'gcode'}`,
    storagePath: `${brand}/${jobId}/plate`,
    fileSizeBytes: 1000,
    createdAt: '2026-01-01T00:00:00Z',
  };
}

function makeJob(overrides: Partial<QueueJob> & { id: string }): QueueJob {
  return {
    printerId: BAMBU_PRINTER.id,
    name: 'Untitled',
    files: [file('bambu', overrides.id)],
    queuePosition: 1,
    status: 'queued',
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

function renderBoard(jobs: QueueJob[]) {
  render(<QueueBoard initialJobs={jobs} user={ADMIN} printers={PRINTERS} printerStatus={PRINTER_STATUS} />);
}

describe('QueueBoard — always renders 3 columns', () => {
  it('shows a logo for each of Flashforge, Bambu, and Snapmaker even with only one printer configured', () => {
    renderBoard([]);
    expect(screen.getByAltText('Flashforge')).toBeTruthy();
    expect(screen.getByAltText('Bambu')).toBeTruthy();
    expect(screen.getByAltText('Snapmaker')).toBeTruthy();
  });

  it('shows the empty "ADD TO QUEUE" placeholder for every column when there are no jobs', () => {
    renderBoard([]);
    expect(screen.getAllByText('ADD TO QUEUE')).toHaveLength(3);
  });

  it('shows "Not Connected" for a brand with no configured printer', () => {
    renderBoard([]);
    expect(screen.getAllByText('Not Connected')).toHaveLength(2); // Flashforge + Snapmaker
  });
});

describe('QueueBoard — column membership is by assigned printer, not file existence', () => {
  it('places a job only in its assigned printer\'s column, even if it also has a file for another brand', () => {
    const job = makeJob({
      id: 'job-a',
      name: 'Dual Brand Job',
      files: [file('bambu', 'job-a'), file('flashforge', 'job-a')],
    });
    renderBoard([job]);

    // Only one card renders for this job — not one per compatible brand.
    expect(screen.getAllByText('Dual Brand Job')).toHaveLength(1);
    // Bambu (its actual assignment) is no longer empty; Flashforge and Snapmaker still show their empty state.
    expect(screen.getAllByText('ADD TO QUEUE')).toHaveLength(2);
    expect(within(screen.getByTestId('column-bambu')).getByText('Dual Brand Job')).toBeTruthy();
    expect(within(screen.getByTestId('column-flashforge')).queryByText('Dual Brand Job')).toBeNull();
  });

  it('a job assigned elsewhere never appears under an unrelated brand column just because a file exists', () => {
    // No printer configured for flashforge/snapmaker, so a job can only ever be assigned to bambu today —
    // this asserts the merged jobs list never gets duplicated across columns.
    const jobs = [
      makeJob({ id: 'job-a', name: 'Job A' }),
      makeJob({ id: 'job-b', name: 'Job B' }),
    ];
    renderBoard(jobs);
    expect(screen.getAllByText('Job A')).toHaveLength(1);
    expect(screen.getAllByText('Job B')).toHaveLength(1);
  });
});

describe('QueueBoard — per-column totals and selection', () => {
  it('sums estimated print time only across the Bambu column\'s waiting jobs', () => {
    const jobs = [
      makeJob({ id: 'a', name: 'Job A', estimatedDurationSeconds: 60 * 60 }),
      makeJob({ id: 'b', name: 'Job B', estimatedDurationSeconds: 30 * 60 }),
    ];
    renderBoard(jobs);
    expect(screen.getByText('1h 30m')).toBeTruthy();
  });

  it('excludes the currently-printing job from the column total', () => {
    const jobs = [
      makeJob({ id: 'printing', name: 'On the bed', status: 'printing', estimatedDurationSeconds: 600 * 60 }),
      makeJob({ id: 'waiting', name: 'Next up', estimatedDurationSeconds: 60 * 60 }),
    ];
    renderBoard(jobs);
    expect(screen.getByText('1h')).toBeTruthy();
  });

  it('shows nothing selected-related and the normal "Select all" label when nothing is checked', () => {
    const jobs = [makeJob({ id: 'a', name: 'Job A', estimatedDurationSeconds: 60 * 60 })];
    renderBoard(jobs);
    expect(screen.getByText('Select all')).toBeTruthy();
    expect(screen.queryByTestId('selected-summary-bambu')).toBeNull();
  });

  it('selecting one job shows its own estimated time next to the count', () => {
    const jobs = [makeJob({ id: 'a', name: 'Job A', estimatedDurationSeconds: 90 * 60 })];
    renderBoard(jobs);

    fireEvent.click(screen.getByLabelText('Select Job A for time calculation'));
    expect(screen.getByTestId('selected-summary-bambu').textContent).toBe('1 selected · 1h 30m');
  });

  it('selecting two jobs shows their combined time', () => {
    const jobs = [
      makeJob({ id: 'a', name: 'Job A', estimatedDurationSeconds: 195 * 60 }),
      makeJob({ id: 'b', name: 'Job B', estimatedDurationSeconds: 45 * 60 }),
    ];
    renderBoard(jobs);

    fireEvent.click(screen.getByLabelText('Select Job A for time calculation'));
    fireEvent.click(screen.getByLabelText('Select Job B for time calculation'));
    expect(screen.getByTestId('selected-summary-bambu').textContent).toBe('2 selected · 4h');
  });

  it('deselecting a job reduces the selected total', () => {
    const jobs = [
      makeJob({ id: 'a', name: 'Job A', estimatedDurationSeconds: 60 * 60 }),
      makeJob({ id: 'b', name: 'Job B', estimatedDurationSeconds: 30 * 60 }),
    ];
    renderBoard(jobs);

    const checkboxA = screen.getByLabelText('Select Job A for time calculation');
    const checkboxB = screen.getByLabelText('Select Job B for time calculation');
    fireEvent.click(checkboxA);
    fireEvent.click(checkboxB);
    expect(screen.getByTestId('selected-summary-bambu').textContent).toBe('2 selected · 1h 30m');

    fireEvent.click(checkboxB);
    expect(screen.getByTestId('selected-summary-bambu').textContent).toBe('1 selected · 1h');
  });

  it('a job with no estimate is selectable, counts toward the total, and contributes 0 minutes', () => {
    const jobs = [
      makeJob({ id: 'a', name: 'Job A', estimatedDurationSeconds: 60 * 60 }),
      makeJob({ id: 'b', name: 'No Estimate', estimatedDurationSeconds: null }),
    ];
    renderBoard(jobs);

    fireEvent.click(screen.getByLabelText('Select Job A for time calculation'));
    fireEvent.click(screen.getByLabelText('Select No Estimate for time calculation'));

    expect(screen.getByTestId('selected-summary-bambu').textContent).toBe('2 selected · 1h');
    expect(screen.getByText(/1 selected job has no estimate\./i)).toBeTruthy();
  });

  it('Select All selects every waiting job in that column and totals their estimated time', () => {
    const jobs = [
      makeJob({ id: 'a', name: 'Job A', estimatedDurationSeconds: 60 * 60 }),
      makeJob({ id: 'b', name: 'Job B', estimatedDurationSeconds: 30 * 60 }),
    ];
    renderBoard(jobs);

    fireEvent.click(within(screen.getByTestId('column-bambu')).getByRole('button', { name: 'All' }));

    expect(screen.getByLabelText('Select Job A for time calculation')).toHaveProperty('checked', true);
    expect(screen.getByLabelText('Select Job B for time calculation')).toHaveProperty('checked', true);
    expect(screen.getByTestId('selected-summary-bambu').textContent).toBe('2 selected · 1h 30m');
  });

  it('Clear removes both the selected count and the selected time', () => {
    const jobs = [makeJob({ id: 'a', name: 'Job A', estimatedDurationSeconds: 60 * 60 })];
    renderBoard(jobs);

    fireEvent.click(within(screen.getByTestId('column-bambu')).getByRole('button', { name: 'All' }));
    expect(screen.getByTestId('selected-summary-bambu')).toBeTruthy();

    fireEvent.click(within(screen.getByTestId('column-bambu')).getByRole('button', { name: 'Clear' }));
    expect(screen.queryByTestId('selected-summary-bambu')).toBeNull();
    expect(screen.getByText('Select all')).toBeTruthy();
  });

  it('keeps the full Queue Time total visible and unchanged while jobs are selected', () => {
    const jobs = [
      makeJob({ id: 'a', name: 'Job A', estimatedDurationSeconds: 60 * 60 }),
      makeJob({ id: 'b', name: 'Job B', estimatedDurationSeconds: 30 * 60 }),
    ];
    renderBoard(jobs);

    fireEvent.click(screen.getByLabelText('Select Job A for time calculation'));

    expect(screen.getByText('1h 30m')).toBeTruthy(); // full column total, unaffected by selection
    expect(screen.getByTestId('selected-summary-bambu').textContent).toBe('1 selected · 1h');
  });
});

describe('QueueBoard — reacting to queue changes', () => {
  it('recomputes totals when the queue data itself updates (e.g. after a refresh)', () => {
    const jobs = [makeJob({ id: 'a', name: 'Job A', estimatedDurationSeconds: 60 * 60 })];
    const { rerender } = render(
      <QueueBoard initialJobs={jobs} user={ADMIN} printers={PRINTERS} printerStatus={PRINTER_STATUS} />,
    );
    expect(screen.getByText('1h')).toBeTruthy();

    const updated = [...jobs, makeJob({ id: 'b', name: 'Job B', estimatedDurationSeconds: 30 * 60 })];
    rerender(<QueueBoard initialJobs={updated} user={ADMIN} printers={PRINTERS} printerStatus={PRINTER_STATUS} />);

    expect(screen.getByText('1h 30m')).toBeTruthy();
  });

  it('does not leave a stale selected-time value after a refresh drops the selected job from the queue', () => {
    const jobs = [
      makeJob({ id: 'a', name: 'Job A', estimatedDurationSeconds: 60 * 60 }),
      makeJob({ id: 'b', name: 'Job B', estimatedDurationSeconds: 30 * 60 }),
    ];
    const { rerender } = render(
      <QueueBoard initialJobs={jobs} user={ADMIN} printers={PRINTERS} printerStatus={PRINTER_STATUS} />,
    );

    fireEvent.click(screen.getByLabelText('Select Job A for time calculation'));
    fireEvent.click(screen.getByLabelText('Select Job B for time calculation'));
    expect(screen.getByTestId('selected-summary-bambu').textContent).toBe('2 selected · 1h 30m');

    // Simulate a realtime-triggered refresh where Job A started printing (left the waiting set).
    const refreshed = [makeJob({ id: 'a', name: 'Job A', status: 'printing', estimatedDurationSeconds: 60 * 60 }), jobs[1]!];
    rerender(<QueueBoard initialJobs={refreshed} user={ADMIN} printers={PRINTERS} printerStatus={PRINTER_STATUS} />);

    expect(screen.getByTestId('selected-summary-bambu').textContent).toBe('1 selected · 30m');
  });

  it('updates the selected total after editing a selected job\'s estimated time (queue data change)', () => {
    const jobs = [makeJob({ id: 'a', name: 'Job A', estimatedDurationSeconds: 60 * 60 })];
    const { rerender } = render(
      <QueueBoard initialJobs={jobs} user={ADMIN} printers={PRINTERS} printerStatus={PRINTER_STATUS} />,
    );

    fireEvent.click(screen.getByLabelText('Select Job A for time calculation'));
    expect(screen.getByTestId('selected-summary-bambu').textContent).toBe('1 selected · 1h');

    const edited = [makeJob({ id: 'a', name: 'Job A', estimatedDurationSeconds: 150 * 60 })];
    rerender(<QueueBoard initialJobs={edited} user={ADMIN} printers={PRINTERS} printerStatus={PRINTER_STATUS} />);

    expect(screen.getByTestId('selected-summary-bambu').textContent).toBe('1 selected · 2h 30m');
  });
});

describe('QueueBoard — selected time is independent across printer columns', () => {
  it('selecting jobs in the Bambu column does not affect the Snapmaker column\'s count or time', () => {
    const jobs = [
      makeJob({ id: 'bambu-job', name: 'Bambu Job', printerId: BAMBU_PRINTER.id, estimatedDurationSeconds: 60 * 60, files: [file('bambu', 'bambu-job')] }),
      makeJob({
        id: 'snap-job',
        name: 'Snapmaker Job',
        printerId: SNAPMAKER_PRINTER.id,
        estimatedDurationSeconds: 45 * 60,
        files: [file('snapmaker', 'snap-job')],
      }),
    ];
    render(<QueueBoard initialJobs={jobs} user={ADMIN} printers={TWO_PRINTERS} printerStatus={TWO_PRINTER_STATUS} />);

    fireEvent.click(screen.getByLabelText('Select Bambu Job for time calculation'));

    expect(screen.getByTestId('selected-summary-bambu').textContent).toBe('1 selected · 1h');
    expect(screen.queryByTestId('selected-summary-snapmaker')).toBeNull();
    expect(within(screen.getByTestId('column-snapmaker')).getByText('Select all')).toBeTruthy();

    // Selecting in Snapmaker afterward doesn't touch Bambu's own total either.
    fireEvent.click(screen.getByLabelText('Select Snapmaker Job for time calculation'));
    expect(screen.getByTestId('selected-summary-bambu').textContent).toBe('1 selected · 1h');
    expect(screen.getByTestId('selected-summary-snapmaker').textContent).toBe('1 selected · 45m');
  });

  it('Clear in one column leaves the other column\'s selection untouched', () => {
    const jobs = [
      makeJob({ id: 'bambu-job', name: 'Bambu Job', printerId: BAMBU_PRINTER.id, estimatedDurationSeconds: 60 * 60, files: [file('bambu', 'bambu-job')] }),
      makeJob({
        id: 'snap-job',
        name: 'Snapmaker Job',
        printerId: SNAPMAKER_PRINTER.id,
        estimatedDurationSeconds: 45 * 60,
        files: [file('snapmaker', 'snap-job')],
      }),
    ];
    render(<QueueBoard initialJobs={jobs} user={ADMIN} printers={TWO_PRINTERS} printerStatus={TWO_PRINTER_STATUS} />);

    fireEvent.click(within(screen.getByTestId('column-bambu')).getByRole('button', { name: 'All' }));
    fireEvent.click(within(screen.getByTestId('column-snapmaker')).getByRole('button', { name: 'All' }));
    expect(screen.getByTestId('selected-summary-bambu').textContent).toBe('1 selected · 1h');
    expect(screen.getByTestId('selected-summary-snapmaker').textContent).toBe('1 selected · 45m');

    fireEvent.click(within(screen.getByTestId('column-bambu')).getByRole('button', { name: 'Clear' }));

    expect(screen.queryByTestId('selected-summary-bambu')).toBeNull();
    expect(screen.getByTestId('selected-summary-snapmaker').textContent).toBe('1 selected · 45m');
  });
});
