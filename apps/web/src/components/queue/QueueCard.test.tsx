// @vitest-environment jsdom
import type { AppUser, JobFileRecord } from '@print-queue/shared';
import { DndContext } from '@dnd-kit/core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueueCard } from './QueueCard';
import type { QueueJob } from './types';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => <img {...props} alt={(props.alt as string) ?? ''} />,
}));

afterEach(() => cleanup());

const ADMIN: AppUser = { id: 'user-1', email: 'a@example.com', displayName: 'Alex', role: 'admin', active: true };
const OPERATOR: AppUser = { ...ADMIN, id: 'user-2', role: 'operator' };

function bambuFile(): JobFileRecord {
  return {
    id: 'file-1',
    jobId: 'job-1',
    printerBrand: 'bambu',
    filename: 'plate.gcode.3mf',
    storagePath: 'bambu/job-1/plate.gcode.3mf',
    fileSizeBytes: 1000,
    createdAt: '2026-01-01T00:00:00Z',
  };
}

function makeJob(overrides: Partial<QueueJob> = {}): QueueJob {
  return {
    id: 'job-1',
    printerId: 'printer-1',
    name: 'Dragon Sign',
    files: [bambuFile()],
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

function renderCard(props: Partial<Parameters<typeof QueueCard>[0]> = {}) {
  render(
    <DndContext>
      <QueueCard
        job={makeJob()}
        brand="bambu"
        position={1}
        user={ADMIN}
        showStart={false}
        startHref={null}
        selectable
        selected={false}
        onToggleSelect={vi.fn()}
        onRemoved={vi.fn()}
        {...props}
      />
    </DndContext>,
  );
}

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
    expect(screen.queryByRole('link', { name: /move up/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /move up/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /move down/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /skip/i })).toBeNull();
  });

  it('shows Edit and Remove for a queued job when the user is an admin', () => {
    renderCard();
    expect(screen.getByLabelText('Edit Dragon Sign')).toBeTruthy();
    expect(screen.getByLabelText('Remove Dragon Sign')).toBeTruthy();
  });

  it('hides admin actions for a non-admin user', () => {
    renderCard({ user: OPERATOR });
    expect(screen.queryByLabelText('Edit Dragon Sign')).toBeNull();
    expect(screen.queryByLabelText('Remove Dragon Sign')).toBeNull();
  });
});

describe('QueueCard — Start button', () => {
  it('shows Start only when showStart is true and a startHref is given', () => {
    renderCard({ showStart: true, startHref: '/start-next?printerId=printer-1' });
    const start = screen.getByRole('link', { name: /start/i });
    expect(start.getAttribute('href')).toBe('/start-next?printerId=printer-1');
  });

  it('does not show Start when showStart is false', () => {
    renderCard({ showStart: false, startHref: '/start-next?printerId=printer-1' });
    expect(screen.queryByRole('link', { name: /start/i })).toBeNull();
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
  });
});

describe('QueueCard — selection', () => {
  it('renders a checkbox when selectable and calls onToggleSelect when clicked', () => {
    renderCard({ selectable: true });
    expect(screen.getByLabelText('Select Dragon Sign for time calculation')).toBeTruthy();
  });

  it('omits the checkbox when not selectable', () => {
    renderCard({ selectable: false });
    expect(screen.queryByLabelText('Select Dragon Sign for time calculation')).toBeNull();
  });
});
