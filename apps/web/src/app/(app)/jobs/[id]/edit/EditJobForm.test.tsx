// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardJob } from '@/components/queue/types';
import { EditJobForm } from './EditJobForm';

const routerPush = vi.fn();
const routerRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, refresh: routerRefresh }),
}));

const BASE_JOB: BoardJob = {
  id: 'job-1',
  customerName: 'John Smith',
  business: '3d_sports_displays',
  notes: 'Rush order',
  queuePosition: 1,
  createdBy: 'user-1',
  createdAt: '2026-01-01T00:00:00Z',
  completedAt: null,
  plates: [],
};

function stubFetch(response: { ok: boolean; body?: unknown }) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: response.ok,
      json: async () => response.body ?? {},
    }),
  );
}

beforeEach(() => {
  routerPush.mockClear();
  routerRefresh.mockClear();
  stubFetch({ ok: true });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function saveForm() {
  fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
  await waitFor(() => expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0));
}

describe('EditJobForm — current state', () => {
  it('prefills customer name and notes from the job', () => {
    render(<EditJobForm job={BASE_JOB} />);
    expect((screen.getByLabelText('Customer name') as HTMLInputElement).value).toBe('John Smith');
    expect((screen.getByLabelText(/order notes/i) as HTMLTextAreaElement).value).toBe('Rush order');
  });
});

describe('EditJobForm — save sequence', () => {
  it('PATCHes /api/jobs/:id with the edited fields and navigates to the job detail page', async () => {
    render(<EditJobForm job={BASE_JOB} />);
    fireEvent.change(screen.getByLabelText('Customer name'), { target: { value: 'Jane Smith' } });

    await saveForm();

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/jobs/job-1');
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body as string);
    expect(body.customerName).toBe('Jane Smith');
    expect(routerPush).toHaveBeenCalledWith('/jobs/job-1');
    expect(routerRefresh).toHaveBeenCalled();
  });

  it('shows the server error and does not navigate when the save fails', async () => {
    stubFetch({ ok: false, body: { error: 'Server exploded' } });
    render(<EditJobForm job={BASE_JOB} />);

    await saveForm();

    expect(await screen.findByText(/server exploded/i)).toBeTruthy();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('rejects an empty customer name client-side without calling the API', async () => {
    render(<EditJobForm job={BASE_JOB} />);
    fireEvent.change(screen.getByLabelText('Customer name'), { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });
});
