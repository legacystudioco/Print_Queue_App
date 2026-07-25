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

  it('selecting a job only affects its own column\'s selection count', () => {
    const jobs = [makeJob({ id: 'a', name: 'Job A', estimatedDurationSeconds: 60 * 60 })];
    renderBoard(jobs);

    fireEvent.click(screen.getByLabelText('Select Job A for time calculation'));
    expect(screen.getByText('1 selected')).toBeTruthy();
  });

  it('Select All selects every waiting job in that column only', () => {
    const jobs = [
      makeJob({ id: 'a', name: 'Job A', estimatedDurationSeconds: 60 * 60 }),
      makeJob({ id: 'b', name: 'Job B', estimatedDurationSeconds: 30 * 60 }),
    ];
    renderBoard(jobs);

    fireEvent.click(within(screen.getByTestId('column-bambu')).getByRole('button', { name: 'All' }));

    expect(screen.getByLabelText('Select Job A for time calculation')).toHaveProperty('checked', true);
    expect(screen.getByLabelText('Select Job B for time calculation')).toHaveProperty('checked', true);
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
});
