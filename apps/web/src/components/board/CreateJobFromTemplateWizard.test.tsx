// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateJobFromTemplateWizard } from './CreateJobFromTemplateWizard';
import type { TemplateWithPlates } from '@/components/templates/types';

function makeTemplate(): TemplateWithPlates {
  return {
    id: 'template-1',
    name: 'Football Display',
    description: null,
    defaultBusiness: '3d_sports_displays',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    archivedAt: null,
    plates: [
      {
        id: 'plate-a',
        templateId: 'template-1',
        plateName: 'Name Plate',
        screenshotPath: 'templates/template-1/a.png',
        screenshotUrl: 'https://example.com/a.png',
        colors: 'Black/White',
        estimatedDurationSeconds: 4800,
        notes: null,
        sortOrder: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'plate-b',
        templateId: 'template-1',
        plateName: 'Base',
        screenshotPath: 'templates/template-1/b.png',
        screenshotUrl: 'https://example.com/b.png',
        colors: 'Black',
        estimatedDurationSeconds: 9000,
        notes: null,
        sortOrder: 2,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ],
  };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ job: { id: 'job-1' } }) }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('CreateJobFromTemplateWizard', () => {
  it('pre-fills plate rows from the template as an independent copy — editing a row never mutates the source template object', async () => {
    const template = makeTemplate();
    const originalColors = template.plates[0]!.colors;

    render(<CreateJobFromTemplateWizard initialTemplate={template} onDone={vi.fn()} />);

    // initialTemplate provided, so the wizard skips straight to the details step.
    fireEvent.change(screen.getByLabelText('Customer name'), { target: { value: 'Riley Johnson' } });
    fireEvent.click(screen.getByRole('button', { name: /Next: Preview/i }));

    const colorsInputs = await screen.findAllByLabelText(/Colors \/ materials/i);
    expect(colorsInputs).toHaveLength(2);
    expect((colorsInputs[0] as HTMLInputElement).value).toBe('Black/White');

    fireEvent.change(colorsInputs[0]!, { target: { value: 'Purple/Gold' } });

    expect((colorsInputs[0] as HTMLInputElement).value).toBe('Purple/Gold');
    // The template object passed in is never mutated by editing the preview row.
    expect(template.plates[0]!.colors).toBe(originalColors);
  });

  it('submits edited plate values and only sends screenshotPath for a replaced image', async () => {
    const template = makeTemplate();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ job: { id: 'job-1' } }) });
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn();

    render(<CreateJobFromTemplateWizard initialTemplate={template} onDone={onDone} />);

    fireEvent.change(screen.getByLabelText('Customer name'), { target: { value: 'Riley Johnson' } });
    fireEvent.click(screen.getByRole('button', { name: /Next: Preview/i }));

    const colorsInputs = await screen.findAllByLabelText(/Colors \/ materials/i);
    fireEvent.change(colorsInputs[0]!, { target: { value: 'Purple/Gold' } });

    fireEvent.click(screen.getByRole('button', { name: /Create Job/i }));

    await screen.findByRole('button', { name: /Create Job/i });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/templates/template-1/jobs',
      expect.objectContaining({ method: 'POST' }),
    );

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body.customerName).toBe('Riley Johnson');
    expect(body.plates).toHaveLength(2);
    expect(body.plates[0].colors).toBe('Purple/Gold');
    // No file was picked for either row, so neither plate carries a screenshotPath — the server copies the template's own screenshot.
    expect(body.plates[0].screenshotPath).toBeUndefined();
    expect(body.plates[1].screenshotPath).toBeUndefined();
  });

  it('asks for a fresh Ship By date every time — omitting it sends null, never anything from the template (which has no such field)', async () => {
    const template = makeTemplate();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ job: { id: 'job-1' } }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<CreateJobFromTemplateWizard initialTemplate={template} onDone={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Customer name'), { target: { value: 'Riley Johnson' } });
    fireEvent.click(screen.getByRole('button', { name: /Next: Preview/i }));
    await screen.findAllByLabelText(/Colors \/ materials/i);
    fireEvent.click(screen.getByRole('button', { name: /Create Job/i }));
    await screen.findByRole('button', { name: /Create Job/i });

    const [, omittedOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(omittedOptions.body as string).shipByDate).toBeNull();
  });

  it('sets the Ship By date entered in the details step on the created job', async () => {
    const template = makeTemplate();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ job: { id: 'job-1' } }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<CreateJobFromTemplateWizard initialTemplate={template} onDone={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Customer name'), { target: { value: 'Riley Johnson' } });
    fireEvent.change(screen.getByLabelText(/ship by/i), { target: { value: '2026-08-14' } });
    fireEvent.click(screen.getByRole('button', { name: /Next: Preview/i }));
    await screen.findAllByLabelText(/Colors \/ materials/i);
    fireEvent.click(screen.getByRole('button', { name: /Create Job/i }));
    await screen.findByRole('button', { name: /Create Job/i });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(options.body as string).shipByDate).toBe('2026-08-14');
  });
});
