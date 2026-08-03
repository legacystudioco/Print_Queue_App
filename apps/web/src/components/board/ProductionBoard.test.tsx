// @vitest-environment jsdom
import type { AppUser } from '@print-queue/shared';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductionBoard } from './ProductionBoard';
import type { BoardJob } from '../queue/types';

// No fixture in this file sets screenshotUrl, so JobCard never renders
// next/image's <Image> (it renders the "add a screenshot" Link fallback
// instead) — no mock needed.

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

function makeJob(overrides: Partial<BoardJob> & { id: string; business: BoardJob['business'] }): BoardJob {
  return {
    name: 'Untitled',
    status: 'queued',
    screenshotPath: null,
    screenshotUrl: null,
    colors: null,
    estimatedDurationSeconds: null,
    notes: null,
    queuePosition: 1,
    parentJobId: null,
    createdBy: 'user-1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    completedAt: null,
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
});

function getColumnDropZone(business: 'sports' | 'dougie') {
  const testId = business === 'sports' ? 'column-3d_sports_displays' : 'column-dougie_doug';
  const column = screen.getByTestId(testId);
  return within(column).getByRole('button', { name: /drop|add/i });
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
    const job = makeJob({ id: 'job-1', business: '3d_sports_displays', name: 'Carlisle 5' });
    render(<ProductionBoard initialJobs={[job]} user={ADMIN} />);

    fireEvent.drop(getColumnDropZone('sports'), { dataTransfer: { files: [pngFile()] } });

    expect(screen.getByRole('dialog', { name: 'Add Job' })).toBeTruthy();
    const fetchCalls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(fetchCalls.some((url) => String(url).includes('move-business'))).toBe(false);
    expect(fetchCalls.some((url) => String(url).includes('/api/queue/reorder'))).toBe(false);
  });

  it('the job card itself still renders its drag handle for reordering', () => {
    const job = makeJob({ id: 'job-1', business: '3d_sports_displays', name: 'Carlisle 5' });
    render(<ProductionBoard initialJobs={[job]} user={ADMIN} />);

    expect(screen.getByRole('button', { name: 'Reorder Carlisle 5' })).toBeTruthy();
  });
});
