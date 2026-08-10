// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GroupJobsWizard } from './GroupJobsWizard';
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

const STANDALONE_JOBS: BoardJob[] = [
  makeJob({
    id: 'job-skintone',
    business: '3d_sports_displays',
    customerName: 'Hug_Skintone',
    plates: [makePlate({ id: 'p-skintone', jobId: 'job-skintone', estimatedDurationSeconds: 3600, status: 'completed' })],
  }),
  makeJob({
    id: 'job-coach',
    business: '3d_sports_displays',
    customerName: 'Hug_Coach & Hair',
    plates: [makePlate({ id: 'p-coach', jobId: 'job-coach', estimatedDurationSeconds: 1800, status: 'queued' })],
  }),
];

function stubFetch(options: { groupOk?: boolean; groupErrorBody?: unknown } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('/api/jobs?')) {
        return { ok: true, json: async () => ({ jobs: STANDALONE_JOBS }) };
      }
      if (url === '/api/jobs/group' && init?.method === 'POST') {
        if (options.groupOk === false) {
          return { ok: false, json: async () => options.groupErrorBody ?? { error: 'Failed to group jobs' } };
        }
        return { ok: true, json: async () => ({ job: { id: 'new-job' } }) };
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

async function goToSelectStep(customerName = 'Hug') {
  fireEvent.change(screen.getByLabelText(/customer \/ order name/i), { target: { value: customerName } });
  fireEvent.click(screen.getByRole('button', { name: /next: select jobs/i }));
  await screen.findByText('Hug_Skintone');
}

async function goToPreviewStep() {
  await goToSelectStep();
  fireEvent.click(screen.getByText('Hug_Skintone'));
  fireEvent.click(screen.getByText('Hug_Coach & Hair'));
  fireEvent.click(screen.getByRole('button', { name: /next: preview/i }));
}

describe('GroupJobsWizard — step navigation', () => {
  it('requires a customer name before moving to the select step', () => {
    render(<GroupJobsWizard onDone={vi.fn()} />);
    expect((screen.getByRole('button', { name: /next: select jobs/i }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/customer \/ order name/i), { target: { value: 'Hug' } });
    expect((screen.getByRole('button', { name: /next: select jobs/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('loads and displays standalone job candidates on the select step', async () => {
    render(<GroupJobsWizard onDone={vi.fn()} />);
    await goToSelectStep();
    expect(screen.getByText('Hug_Coach & Hair')).toBeTruthy();

    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const jobsCall = calls.find((c) => String(c[0]).startsWith('/api/jobs?'));
    expect(String(jobsCall?.[0])).toContain('standaloneOnly=true');
  });

  it('requires at least one selected job before moving to preview', async () => {
    render(<GroupJobsWizard onDone={vi.fn()} />);
    await goToSelectStep();
    expect((screen.getByRole('button', { name: /next: preview/i }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByText('Hug_Skintone'));
    expect((screen.getByRole('button', { name: /next: preview/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('"select all" selects every currently-loaded job and toggling it again clears the selection', async () => {
    render(<GroupJobsWizard onDone={vi.fn()} />);
    await goToSelectStep();

    fireEvent.click(screen.getByRole('checkbox', { name: /select all/i }));
    expect(screen.getByText('2 selected')).toBeTruthy();

    fireEvent.click(screen.getByRole('checkbox', { name: /select all/i }));
    expect(screen.getByText('0 selected')).toBeTruthy();
  });
});

function statValue(label: string) {
  const labelEl = screen.getByText(label);
  return labelEl.parentElement?.querySelector('p:last-child')?.textContent;
}

describe('GroupJobsWizard — preview totals', () => {
  it('shows plate count, total time, completed, and remaining derived from the selected jobs\' plates', async () => {
    render(<GroupJobsWizard onDone={vi.fn()} />);
    await goToPreviewStep();

    expect(screen.getByText('Hug')).toBeTruthy();
    expect(screen.getByText('Hug_Skintone')).toBeTruthy();
    expect(screen.getByText('Hug_Coach & Hair')).toBeTruthy();

    // One completed (Skintone, 1h) + one queued (Coach & Hair, 30m).
    expect(statValue('Plates')).toBe('2');
    expect(statValue('Completed')).toBe('1');
    expect(statValue('Remaining')).toBe('1');
    expect(statValue('Total print time')).toBe('1h 30m');
  });
});

describe('GroupJobsWizard — confirm', () => {
  it('POSTs /api/jobs/group with the job details and selected source job ids, then calls onDone', async () => {
    const onDone = vi.fn();
    render(<GroupJobsWizard onDone={onDone} />);
    await goToPreviewStep();

    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());

    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const groupCall = calls.find((c) => c[0] === '/api/jobs/group');
    expect(groupCall).toBeTruthy();
    const body = JSON.parse((groupCall![1] as RequestInit).body as string);
    expect(body.customerName).toBe('Hug');
    expect(body.business).toBe('3d_sports_displays');
    expect(new Set(body.sourceJobIds)).toEqual(new Set(['job-skintone', 'job-coach']));
  });

  it('shows the server error and does not call onDone when the group request fails', async () => {
    stubFetch({ groupOk: false, groupErrorBody: { error: 'Job is not standalone' } });
    const onDone = vi.fn();
    render(<GroupJobsWizard onDone={onDone} />);
    await goToPreviewStep();

    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

    expect(await screen.findByText(/job is not standalone/i)).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });
});
