// @vitest-environment jsdom
import type { AppUser } from '@print-queue/shared';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductionBoard } from './ProductionBoard';
import type { BoardJob, BoardPlate } from '../queue/types';

// No fixture in this file sets screenshotUrl, so JobCard never renders
// next/image's <Image> — no mock needed.

const routerRefresh = vi.fn();
const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefresh, push: routerPush }),
}));

// ProductionBoard subscribes to Realtime on mount purely as a side effect —
// the fake channel just needs to satisfy the chain without touching the network.
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  }),
}));

const ADMIN: AppUser = { id: 'user-1', email: 'a@example.com', displayName: 'Alex', role: 'admin', active: true };

function makePlate(overrides: Partial<BoardPlate> = {}): BoardPlate {
  return {
    id: 'plate-1',
    jobId: 'job-1',
    plateName: 'Base',
    screenshotPath: null,
    screenshotUrl: null,
    colors: null,
    estimatedDurationSeconds: null,
    notes: null,
    status: 'queued',
    parentPlateId: null,
    sortOrder: 1,
    createdAt: '2026-01-01T00:00:00Z',
    completedAt: null,
    ...overrides,
  };
}

function makeJob(overrides: Partial<BoardJob> & { id: string; business: BoardJob['business'] }): BoardJob {
  return {
    customerName: 'Untitled',
    notes: null,
    queuePosition: 1,
    createdBy: 'user-1',
    createdAt: '2026-01-01T00:00:00Z',
    completedAt: null,
    shipByDate: null,
    plates: [makePlate({ id: `${overrides.id}-plate`, jobId: overrides.id })],
    ...overrides,
  };
}

function pngFile(name = 'plate.png') {
  return new File([new Uint8Array(10)], name, { type: 'image/png' });
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:mock-preview');
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function getColumnDropZone(business: 'sports' | 'dougie') {
  const testId = business === 'sports' ? 'column-3d_sports_displays' : 'column-dougie_doug';
  const column = screen.getByTestId(testId);
  // Matches the column's own "Add Job"/"drop a plate screenshot" targets,
  // never a card's "Add Plate" button (JobCard renders one per customer).
  return within(column).getByRole('button', { name: /add (a )?job|drop a plate screenshot/i });
}

describe('ProductionBoard — dropping an image opens Add Job with the business preselected', () => {
  it('dropping onto the empty 3D Sports Displays column preselects that business and shows the preview', () => {
    render(<ProductionBoard initialJobs={[]} user={ADMIN} />);
    const zone = getColumnDropZone('sports');

    fireEvent.drop(zone, { dataTransfer: { files: [pngFile()] } });

    expect(screen.getByRole('dialog', { name: 'Add Job' })).toBeTruthy();
    const businessSelect = screen.getByLabelText('Business') as HTMLSelectElement;
    expect(businessSelect.value).toBe('3d_sports_displays');
    expect((screen.getByAltText('Selected build plate screenshot') as HTMLImageElement).src).toContain('blob:');
  });

  it('dropping onto the empty Dougie-Doug column preselects that business', () => {
    render(<ProductionBoard initialJobs={[]} user={ADMIN} />);
    const zone = getColumnDropZone('dougie');

    fireEvent.drop(zone, { dataTransfer: { files: [pngFile()] } });

    expect(screen.getByRole('dialog', { name: 'Add Job' })).toBeTruthy();
    const businessSelect = screen.getByLabelText('Business') as HTMLSelectElement;
    expect(businessSelect.value).toBe('dougie_doug');
  });

  it('the preselected business can still be changed before saving', () => {
    render(<ProductionBoard initialJobs={[]} user={ADMIN} />);
    fireEvent.drop(getColumnDropZone('sports'), { dataTransfer: { files: [pngFile()] } });

    const businessSelect = screen.getByLabelText('Business') as HTMLSelectElement;
    expect(businessSelect.value).toBe('3d_sports_displays');

    fireEvent.change(businessSelect, { target: { value: 'dougie_doug' } });
    expect(businessSelect.value).toBe('dougie_doug');
  });
});

describe('ProductionBoard — empty column drop zone is a normal accessible control', () => {
  it('is clickable', () => {
    render(<ProductionBoard initialJobs={[]} user={ADMIN} />);
    fireEvent.click(getColumnDropZone('sports'));
    expect(screen.getByRole('dialog', { name: 'Add Job' })).toBeTruthy();
  });

  it('is keyboard activatable', () => {
    render(<ProductionBoard initialJobs={[]} user={ADMIN} />);
    fireEvent.keyDown(getColumnDropZone('dougie'), { key: 'Enter' });
    expect(screen.getByRole('dialog', { name: 'Add Job' })).toBeTruthy();
  });
});

describe('ProductionBoard — native file drag is isolated from card dragging', () => {
  it('dropping a file on the non-empty column\'s Add Job strip opens the dialog and never calls the move/reorder APIs', () => {
    const job = makeJob({ id: 'job-1', business: '3d_sports_displays', customerName: 'Carlisle 5' });
    render(<ProductionBoard initialJobs={[job]} user={ADMIN} />);

    fireEvent.drop(getColumnDropZone('sports'), { dataTransfer: { files: [pngFile()] } });

    expect(screen.getByRole('dialog', { name: 'Add Job' })).toBeTruthy();
    const fetchCalls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(fetchCalls.some((url) => String(url).includes('move-business'))).toBe(false);
    expect(fetchCalls.some((url) => String(url).includes('/api/queue/reorder'))).toBe(false);
  });

  it('the job card itself still renders its drag handle for reordering', () => {
    const job = makeJob({ id: 'job-1', business: '3d_sports_displays', customerName: 'Carlisle 5' });
    render(<ProductionBoard initialJobs={[job]} user={ADMIN} />);

    expect(screen.getByRole('button', { name: 'Reorder Carlisle 5' })).toBeTruthy();
  });
});

describe('ProductionBoard — job card shows customer/plate progress', () => {
  it('renders the customer name and plate completion count', () => {
    const job = makeJob({
      id: 'job-1',
      business: '3d_sports_displays',
      customerName: 'John Smith',
      plates: [
        makePlate({ id: 'p1', jobId: 'job-1', plateName: 'Football Name', status: 'completed' }),
        makePlate({ id: 'p2', jobId: 'job-1', plateName: 'Base', status: 'queued' }),
      ],
    });
    render(<ProductionBoard initialJobs={[job]} user={ADMIN} />);

    expect(screen.getByText('John Smith')).toBeTruthy();
    expect(screen.getByText('1 / 2 plates complete')).toBeTruthy();
  });

  it('shows the Ship By date on the collapsed card when set, and no row at all when unset', () => {
    vi.setSystemTime(new Date(2026, 7, 10));
    const jobWithDate = makeJob({
      id: 'job-2',
      business: '3d_sports_displays',
      customerName: 'Jane Doe',
      shipByDate: '2026-08-14',
      plates: [makePlate({ id: 'p3', jobId: 'job-2' })],
    });
    const jobWithoutDate = makeJob({
      id: 'job-3',
      business: '3d_sports_displays',
      customerName: 'Sam Lee',
      plates: [makePlate({ id: 'p4', jobId: 'job-3' })],
    });
    render(<ProductionBoard initialJobs={[jobWithDate, jobWithoutDate]} user={ADMIN} />);

    expect(screen.getByText(/ship by: aug 14/i)).toBeTruthy();
    expect(screen.getAllByText(/ship by/i)).toHaveLength(1);
  });

  it('expanding the card reveals its plates', () => {
    const job = makeJob({
      id: 'job-1',
      business: '3d_sports_displays',
      customerName: 'John Smith',
      plates: [makePlate({ id: 'p1', jobId: 'job-1', plateName: 'Football Name', status: 'queued' })],
    });
    render(<ProductionBoard initialJobs={[job]} user={ADMIN} />);

    expect(screen.queryByText('Football Name')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /expand/i }));
    expect(screen.getByText('Football Name')).toBeTruthy();
  });
});

/** JobPickerList (used by MoveIntoJobDialog/GroupJobsDialog) needs {jobs: [...]} back, unlike this file's default `{}` stub. */
function stubFetchWithEmptyJobPicker() {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: RequestInfo | URL) => {
      if (String(url).startsWith('/api/jobs?')) {
        return Promise.resolve({ ok: true, json: async () => ({ jobs: [] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }),
  );
}

describe('ProductionBoard — Move into Job is offered only for standalone (single-plate) jobs', () => {
  it('shows "Move into Job…" on a job with exactly one plate', () => {
    const job = makeJob({
      id: 'job-1',
      business: '3d_sports_displays',
      customerName: 'Hug_Extras',
      plates: [makePlate({ id: 'p1', jobId: 'job-1' })],
    });
    render(<ProductionBoard initialJobs={[job]} user={ADMIN} />);

    expect(screen.getByRole('button', { name: /move hug_extras into another job/i })).toBeTruthy();
  });

  it('hides "Move into Job…" on a job that already has more than one plate', () => {
    const job = makeJob({
      id: 'job-1',
      business: '3d_sports_displays',
      customerName: 'Hug',
      plates: [makePlate({ id: 'p1', jobId: 'job-1' }), makePlate({ id: 'p2', jobId: 'job-1' })],
    });
    render(<ProductionBoard initialJobs={[job]} user={ADMIN} />);

    expect(screen.queryByRole('button', { name: /move hug into another job/i })).toBeNull();
  });

  it('opens the Move into Job dialog on click', () => {
    stubFetchWithEmptyJobPicker();
    const job = makeJob({
      id: 'job-1',
      business: '3d_sports_displays',
      customerName: 'Hug_Extras',
      plates: [makePlate({ id: 'p1', jobId: 'job-1' })],
    });
    render(<ProductionBoard initialJobs={[job]} user={ADMIN} />);

    fireEvent.click(screen.getByRole('button', { name: /move hug_extras into another job/i }));
    expect(screen.getByRole('dialog', { name: 'Move into Job' })).toBeTruthy();
  });
});

describe('ProductionBoard — Remove from Job is offered only for plates that have siblings', () => {
  it('shows "Remove from Job" on each plate of an expanded multi-plate job', () => {
    const job = makeJob({
      id: 'job-1',
      business: '3d_sports_displays',
      customerName: 'Hug',
      plates: [
        makePlate({ id: 'p1', jobId: 'job-1', plateName: 'Skintone' }),
        makePlate({ id: 'p2', jobId: 'job-1', plateName: 'Extras' }),
      ],
    });
    render(<ProductionBoard initialJobs={[job]} user={ADMIN} />);
    fireEvent.click(screen.getByRole('button', { name: /expand/i }));

    expect(screen.getByRole('button', { name: /remove skintone from its job/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /remove extras from its job/i })).toBeTruthy();
  });

  it('hides "Remove from Job" on a job\'s only plate', () => {
    const job = makeJob({
      id: 'job-1',
      business: '3d_sports_displays',
      customerName: 'Hug_Extras',
      plates: [makePlate({ id: 'p1', jobId: 'job-1', plateName: 'Hug_Extras' })],
    });
    render(<ProductionBoard initialJobs={[job]} user={ADMIN} />);
    fireEvent.click(screen.getByRole('button', { name: /expand/i }));

    expect(screen.queryByRole('button', { name: /remove hug_extras from its job/i })).toBeNull();
  });

  it('POSTs /api/plates/:id/remove-from-job when clicked', () => {
    const job = makeJob({
      id: 'job-1',
      business: '3d_sports_displays',
      customerName: 'Hug',
      plates: [
        makePlate({ id: 'p1', jobId: 'job-1', plateName: 'Skintone' }),
        makePlate({ id: 'p2', jobId: 'job-1', plateName: 'Extras' }),
      ],
    });
    render(<ProductionBoard initialJobs={[job]} user={ADMIN} />);
    fireEvent.click(screen.getByRole('button', { name: /expand/i }));

    fireEvent.click(screen.getByRole('button', { name: /remove skintone from its job/i }));

    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.some((c) => c[0] === '/api/plates/p1/remove-from-job' && (c[1] as RequestInit).method === 'POST')).toBe(
      true,
    );
  });
});
