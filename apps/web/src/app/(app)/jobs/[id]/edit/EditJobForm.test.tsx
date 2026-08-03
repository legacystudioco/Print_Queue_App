// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardJobWithScreenshotUrl } from '@/lib/server/data';
import { EditJobForm } from './EditJobForm';

const routerPush = vi.fn();
const routerRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, refresh: routerRefresh }),
}));

const uploadJobScreenshotMock = vi.fn().mockResolvedValue(undefined);
const deleteJobScreenshotMock = vi.fn().mockResolvedValue({ ok: true });

vi.mock('@/lib/client/uploadJobScreenshot', async () => {
  const actual = await vi.importActual<typeof import('@/lib/client/uploadJobScreenshot')>(
    '@/lib/client/uploadJobScreenshot',
  );
  return {
    ...actual,
    buildScreenshotPath: (jobId: string, name: string) => `${jobId}/unique-token-${name}`,
    uploadJobScreenshot: (...args: unknown[]) => uploadJobScreenshotMock(...args),
    deleteJobScreenshot: (...args: unknown[]) => deleteJobScreenshotMock(...args),
  };
});

const BASE_JOB: BoardJobWithScreenshotUrl = {
  id: 'job-1',
  name: 'Carlisle 5',
  business: '3d_sports_displays',
  status: 'queued',
  screenshotPath: 'job-1/original.png',
  screenshotUrl: 'https://example.com/job-1/original.png',
  colors: 'Black PLA',
  estimatedDurationSeconds: 3600,
  notes: null,
  queuePosition: 1,
  parentJobId: null,
  createdBy: 'user-1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  completedAt: null,
};

const LEGACY_JOB: BoardJobWithScreenshotUrl = { ...BASE_JOB, screenshotPath: null, screenshotUrl: null };

function pngFile(name = 'new-plate.png') {
  return new File([new Uint8Array(10)], name, { type: 'image/png' });
}

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
  URL.createObjectURL = vi.fn(() => 'blob:mock-preview');
  URL.revokeObjectURL = vi.fn();
  uploadJobScreenshotMock.mockClear();
  uploadJobScreenshotMock.mockResolvedValue(undefined);
  deleteJobScreenshotMock.mockClear();
  deleteJobScreenshotMock.mockResolvedValue({ ok: true });
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
  it('shows the current screenshot for a job that already has one', () => {
    render(<EditJobForm job={BASE_JOB} />);
    const img = screen.getByAltText(`Current screenshot for ${BASE_JOB.name}`) as HTMLImageElement;
    expect(img.src).toBe(BASE_JOB.screenshotUrl);
    expect(screen.getByRole('button', { name: 'Replace screenshot' })).toBeTruthy();
  });

  it('shows the missing-image placeholder (no preview) for a legacy job with no screenshot', () => {
    render(<EditJobForm job={LEGACY_JOB} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add screenshot' })).toBeTruthy();
  });
});

describe('EditJobForm — selecting a replacement', () => {
  it('shows a local preview immediately without uploading', () => {
    render(<EditJobForm job={BASE_JOB} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [pngFile()] } });

    const img = screen.getByAltText(`Selected replacement screenshot for ${BASE_JOB.name}`) as HTMLImageElement;
    expect(img.src).toContain('blob:mock-preview');
    expect(uploadJobScreenshotMock).not.toHaveBeenCalled();
    expect(deleteJobScreenshotMock).not.toHaveBeenCalled();
  });

  it('the selected replacement can be removed, restoring the original preview, before saving', () => {
    render(<EditJobForm job={BASE_JOB} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pngFile()] } });
    expect(screen.getByAltText(`Selected replacement screenshot for ${BASE_JOB.name}`)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /remove selected replacement/i }));

    const img = screen.getByAltText(`Current screenshot for ${BASE_JOB.name}`) as HTMLImageElement;
    expect(img.src).toBe(BASE_JOB.screenshotUrl);
  });
});

describe('EditJobForm — save sequence', () => {
  it('uploads the new image to a fresh path and updates the job when no replacement is selected (fields only)', async () => {
    render(<EditJobForm job={BASE_JOB} />);
    await saveForm();

    expect(uploadJobScreenshotMock).not.toHaveBeenCalled();
    const [, patchInit] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(patchInit.body as string);
    expect(body.screenshotPath).toBeUndefined();
    expect(deleteJobScreenshotMock).not.toHaveBeenCalled();
    expect(routerPush).toHaveBeenCalledWith(`/jobs/${BASE_JOB.id}`);
  });

  it('uploads the replacement to a path distinct from the original, then updates the job', async () => {
    render(<EditJobForm job={BASE_JOB} />);
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [pngFile()] },
    });

    await saveForm();

    expect(uploadJobScreenshotMock).toHaveBeenCalledTimes(1);
    const uploadArgs = uploadJobScreenshotMock.mock.calls[0]![0] as { storagePath: string };
    expect(uploadArgs.storagePath).not.toBe(BASE_JOB.screenshotPath);
    expect(uploadArgs.storagePath).toBe(`${BASE_JOB.id}/unique-token-new-plate.png`);

    const [, patchInit] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(patchInit.body as string);
    expect(body.screenshotPath).toBe(uploadArgs.storagePath);
  });

  it('deletes the previous screenshot only after the update succeeds', async () => {
    render(<EditJobForm job={BASE_JOB} />);
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [pngFile()] },
    });

    await saveForm();
    await waitFor(() => expect(deleteJobScreenshotMock).toHaveBeenCalledTimes(1));

    expect(deleteJobScreenshotMock).toHaveBeenCalledWith(BASE_JOB.screenshotPath);
    // The delete only happens after the PATCH resolved successfully.
    const patchCallOrder = (fetch as unknown as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!;
    const deleteCallOrder = deleteJobScreenshotMock.mock.invocationCallOrder[0]!;
    expect(deleteCallOrder).toBeGreaterThan(patchCallOrder);
  });

  it('on a failed update, removes the newly-uploaded object and leaves the original screenshot referenced', async () => {
    stubFetch({ ok: false, body: { error: 'Server exploded' } });
    render(<EditJobForm job={BASE_JOB} />);
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [pngFile()] },
    });

    await saveForm();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/server exploded/i));

    expect(deleteJobScreenshotMock).toHaveBeenCalledWith(`${BASE_JOB.id}/unique-token-new-plate.png`);
    expect(deleteJobScreenshotMock).not.toHaveBeenCalledWith(BASE_JOB.screenshotPath);
    expect(routerPush).not.toHaveBeenCalled();
    // The form is left intact for a retry, not reset.
    expect(screen.getByAltText(`Selected replacement screenshot for ${BASE_JOB.name}`)).toBeTruthy();
  });

  it('does not attempt to delete anything for a legacy job that never had a screenshot', async () => {
    render(<EditJobForm job={LEGACY_JOB} />);
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [pngFile()] },
    });

    await saveForm();
    await waitFor(() => expect(routerPush).toHaveBeenCalled());

    expect(deleteJobScreenshotMock).not.toHaveBeenCalled();
  });
});
