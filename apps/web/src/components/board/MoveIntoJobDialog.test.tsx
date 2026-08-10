// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MoveIntoJobDialog } from './MoveIntoJobDialog';
import type { BoardJob, BoardPlate } from '../queue/types';

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

const TARGET_JOBS: BoardJob[] = [
  makeJob({ id: 'job-hug', business: '3d_sports_displays', customerName: 'Hug' }),
  makeJob({ id: 'job-carlisle', business: '3d_sports_displays', customerName: 'Carlisle' }),
];

function stubFetch(options: { moveOk?: boolean; moveErrorBody?: unknown } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('/api/jobs?')) {
        return { ok: true, json: async () => ({ jobs: TARGET_JOBS }) };
      }
      if (url === '/api/jobs/job-extras/move-into' && init?.method === 'POST') {
        if (options.moveOk === false) {
          return { ok: false, json: async () => options.moveErrorBody ?? { error: 'Failed to move job' } };
        }
        return { ok: true, json: async () => ({ job: { id: 'job-hug' } }) };
      }
      return { ok: true, json: async () => ({}) };
    }),
  );
}

beforeEach(() => {
  stubFetch();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('MoveIntoJobDialog', () => {
  it('excludes the source job itself from the target list request', async () => {
    render(
      <MoveIntoJobDialog sourceJobId="job-extras" sourceJobName="Hug_Extras" open onClose={vi.fn()} onDone={vi.fn()} />,
    );
    await screen.findByText('Hug');

    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const jobsCall = calls.find((c) => String(c[0]).startsWith('/api/jobs?'));
    expect(String(jobsCall?.[0])).toContain('excludeId=job-extras');
    expect(String(jobsCall?.[0])).not.toContain('standaloneOnly');
  });

  it('disables the confirm button until a target is selected, then POSTs the chosen target', async () => {
    const onDone = vi.fn();
    render(
      <MoveIntoJobDialog sourceJobId="job-extras" sourceJobName="Hug_Extras" open onClose={vi.fn()} onDone={onDone} />,
    );
    await screen.findByText('Hug');

    expect((screen.getByRole('button', { name: /move into job/i }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByText('Hug'));
    expect((screen.getByRole('button', { name: /move into hug/i }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /move into hug/i }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());

    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const moveCall = calls.find((c) => c[0] === '/api/jobs/job-extras/move-into');
    expect(moveCall).toBeTruthy();
    const body = JSON.parse((moveCall![1] as RequestInit).body as string);
    expect(body.targetJobId).toBe('job-hug');
  });

  it('shows the server error and does not call onDone when the move fails', async () => {
    stubFetch({ moveOk: false, moveErrorBody: { error: 'Cannot move a job into itself' } });
    const onDone = vi.fn();
    render(
      <MoveIntoJobDialog sourceJobId="job-extras" sourceJobName="Hug_Extras" open onClose={vi.fn()} onDone={onDone} />,
    );
    await screen.findByText('Hug');

    fireEvent.click(screen.getByText('Hug'));
    fireEvent.click(screen.getByRole('button', { name: /move into hug/i }));

    expect(await screen.findByText(/cannot move a job into itself/i)).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('disables the confirm button while the move is in flight, preventing a double submit', async () => {
    let resolveMove!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith('/api/jobs?')) return { ok: true, json: async () => ({ jobs: TARGET_JOBS }) };
        if (url === '/api/jobs/job-extras/move-into' && init?.method === 'POST') {
          return new Promise((resolve) => {
            resolveMove = resolve;
          });
        }
        return { ok: true, json: async () => ({}) };
      }),
    );

    render(
      <MoveIntoJobDialog sourceJobId="job-extras" sourceJobName="Hug_Extras" open onClose={vi.fn()} onDone={vi.fn()} />,
    );
    await screen.findByText('Hug');
    fireEvent.click(screen.getByText('Hug'));

    const button = screen.getByRole('button', { name: /move into hug/i }) as HTMLButtonElement;
    fireEvent.click(button);
    expect(button.disabled).toBe(true);

    fireEvent.click(button);

    const moveCalls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => c[0] === '/api/jobs/job-extras/move-into',
    );
    expect(moveCalls).toHaveLength(1);

    resolveMove({ ok: true, json: async () => ({ job: { id: 'job-hug' } }) });
  });
});
