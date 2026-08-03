// @vitest-environment jsdom
import type { AppUser, JobFileRecord, PrinterBrand } from '@print-queue/shared';
import { DndContext } from '@dnd-kit/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueueCard } from './QueueCard';
import type { QueueJob } from './types';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => <img {...props} alt={(props.alt as string) ?? ''} />,
}));

const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  routerPush.mockClear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ADMIN: AppUser = { id: 'user-1', email: 'a@example.com', displayName: 'Alex', role: 'admin', active: true };
const OPERATOR: AppUser = { ...ADMIN, id: 'user-2', role: 'operator' };
const START_HREF = '/start-next?printerId=printer-1';

function file(brand: PrinterBrand): JobFileRecord {
  return {
    id: `file-1-${brand}`,
    jobId: 'job-1',
    printerBrand: brand,
    filename: brand === 'bambu' ? 'plate.gcode.3mf' : 'plate.gcode',
    storagePath: `${brand}/job-1/plate`,
    fileSizeBytes: 1000,
    createdAt: '2026-01-01T00:00:00Z',
  };
}

function makeJob(overrides: Partial<QueueJob> = {}): QueueJob {
  return {
    id: 'job-1',
    printerId: 'printer-1',
    name: 'Dragon Sign',
    files: [file('bambu')],
    queuePosition: 1,
    status: 'queued',
    estimatedDurationSeconds: 130 * 60,
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

function renderCard(props: Partial<Parameters<typeof QueueCard>[0]> = {}, brand: PrinterBrand = 'bambu') {
  render(
    <DndContext>
      <QueueCard
        job={makeJob({ files: [file(brand)] })}
        brand={brand}
        position={1}
        user={ADMIN}
        isFirstInQueue
        startHref={START_HREF}
        waitingJobIds={['job-1']}
        selectable
        selected={false}
        onToggleSelect={vi.fn()}
        onRemoved={vi.fn()}
        {...props}
      />
    </DndContext>,
  );
}

describe('QueueCard — no redundant status badge', () => {
  it('never renders a "Queued" status badge', () => {
    renderCard();
    expect(screen.queryByText(/^queued$/i)).toBeNull();
  });

  it('does not render any status badge for other statuses either', () => {
    renderCard({ job: makeJob({ status: 'printing' }) });
    expect(screen.queryByText(/^printing$/i)).toBeNull();
  });
});

describe('QueueCard — Start on every card', () => {
  it('renders Start on the first job in queue', () => {
    renderCard({ isFirstInQueue: true });
    expect(screen.getByRole('button', { name: /^start$/i })).toBeTruthy();
  });

  it('renders Start on a later (non-first) job too', () => {
    renderCard({ isFirstInQueue: false });
    expect(screen.getByRole('button', { name: /^start$/i })).toBeTruthy();
  });

  it('renders Start consistently for bambu, snapmaker, and flashforge cards', () => {
    for (const brand of ['bambu', 'snapmaker', 'flashforge'] as const) {
      cleanup();
      renderCard({}, brand);
      expect(screen.getByRole('button', { name: /^start$/i })).toBeTruthy();
    }
  });
});

describe('QueueCard — Start behavior: first job (normal flow)', () => {
  it('navigates straight to the start-next flow with no confirmation and no reorder call', () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderCard({ isFirstInQueue: true });
    fireEvent.click(screen.getByRole('button', { name: /^start$/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(routerPush).toHaveBeenCalledWith(START_HREF);
  });
});

describe('QueueCard — Start behavior: later job (bypass/promote flow)', () => {
  it('asks for confirmation before doing anything', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderCard({ isFirstInQueue: false });
    fireEvent.click(screen.getByRole('button', { name: /^start$/i }));

    expect(window.confirm).toHaveBeenCalledWith(
      'Start this job now? It will move ahead of the jobs currently before it.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('promotes the job to the front via the reorder endpoint, preserving the order of the rest, then navigates', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    renderCard({
      job: makeJob({ id: 'c' }),
      isFirstInQueue: false,
      waitingJobIds: ['a', 'b', 'c', 'd'],
    });
    fireEvent.click(screen.getByRole('button', { name: /^start$/i }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/queue/reorder',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ printerId: 'printer-1', orderedJobIds: ['c', 'a', 'b', 'd'] }),
      }),
    );
    await vi.waitFor(() => expect(routerPush).toHaveBeenCalledWith(START_HREF));
  });

  it('shows an error and does not navigate when the reorder call fails', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Queue changed, try again' }) }),
    );

    renderCard({ isFirstInQueue: false, waitingJobIds: ['job-1', 'other'] });
    fireEvent.click(screen.getByRole('button', { name: /^start$/i }));

    expect(await screen.findByText('Queue changed, try again')).toBeTruthy();
    expect(routerPush).not.toHaveBeenCalled();
  });
});

describe('QueueCard — layout', () => {
  it('shows the job name, queue number, and estimated duration, but no filename', () => {
    renderCard();
    expect(screen.getByText('Dragon Sign')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('~2h 10m')).toBeTruthy();
    expect(screen.queryByText('plate.gcode.3mf')).toBeNull();
  });

  it('never renders Up, Down, or Skip', () => {
    renderCard();
    expect(screen.queryByRole('button', { name: /move up/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /move down/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /skip/i })).toBeNull();
  });

  it('shows Edit and Remove for a queued job when the user is an admin', () => {
    renderCard();
    expect(screen.getByLabelText('Edit Dragon Sign')).toBeTruthy();
    expect(screen.getByLabelText('Remove Dragon Sign')).toBeTruthy();
  });

  it('hides admin actions (including Start) for a non-admin user', () => {
    renderCard({ user: OPERATOR });
    expect(screen.queryByLabelText('Edit Dragon Sign')).toBeNull();
    expect(screen.queryByLabelText('Remove Dragon Sign')).toBeNull();
    expect(screen.queryByRole('button', { name: /^start$/i })).toBeNull();
  });

  it('places actions in Edit, Start, Remove order', () => {
    renderCard();
    const buttons = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-label') || /start/i.test(b.textContent ?? ''));
    const labels = buttons.map((b) => b.getAttribute('aria-label') ?? b.textContent);
    const editIndex = labels.findIndex((l) => /edit/i.test(l ?? ''));
    const startIndex = labels.findIndex((l) => /start/i.test(l ?? ''));
    const removeIndex = labels.findIndex((l) => /remove/i.test(l ?? ''));
    expect(editIndex).toBeLessThan(startIndex);
    expect(startIndex).toBeLessThan(removeIndex);
  });
});

describe('QueueCard — status-dependent actions', () => {
  it('shows Retry only for a failed job', () => {
    renderCard({ job: makeJob({ status: 'failed' }) });
    expect(screen.getByLabelText('Retry Dragon Sign')).toBeTruthy();
  });

  it('does not show Retry for a queued job', () => {
    renderCard();
    expect(screen.queryByLabelText('Retry Dragon Sign')).toBeNull();
  });

  it('hides Edit/Start/Remove for an actively-printing job', () => {
    renderCard({ job: makeJob({ status: 'printing' }) });
    expect(screen.queryByLabelText('Edit Dragon Sign')).toBeNull();
    expect(screen.queryByLabelText('Remove Dragon Sign')).toBeNull();
    expect(screen.queryByRole('button', { name: /^start$/i })).toBeNull();
  });
});

describe('QueueCard — selection', () => {
  it('renders a checkbox when selectable', () => {
    renderCard({ selectable: true });
    expect(screen.getByLabelText('Select Dragon Sign for time calculation')).toBeTruthy();
  });

  it('omits the checkbox when not selectable', () => {
    renderCard({ selectable: false });
    expect(screen.queryByLabelText('Select Dragon Sign for time calculation')).toBeNull();
  });
});

describe('QueueCard — printer compatibility', () => {
  it('shows compatible and incompatible brands correctly', () => {
    renderCard({ job: makeJob({ files: [file('bambu'), file('snapmaker')] }) });
    expect(screen.getByLabelText('Compatible with Bambu')).toBeTruthy();
    expect(screen.getByLabelText('Compatible with Snapmaker')).toBeTruthy();
    expect(screen.getByLabelText('Not compatible with Flashforge')).toBeTruthy();
  });
});
