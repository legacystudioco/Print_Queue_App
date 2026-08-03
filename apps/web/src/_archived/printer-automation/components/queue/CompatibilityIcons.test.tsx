// @vitest-environment jsdom
import type { JobFileRecord } from '@print-queue/shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompatibilityIcons } from './CompatibilityIcons';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => <img {...props} alt={(props.alt as string) ?? ''} />,
}));

afterEach(() => cleanup());

function file(brand: JobFileRecord['printerBrand']): JobFileRecord {
  return {
    id: `file-${brand}`,
    jobId: 'job-1',
    printerBrand: brand,
    filename: 'plate',
    storagePath: `${brand}/job-1/plate`,
    fileSizeBytes: 1000,
    createdAt: '2026-01-01T00:00:00Z',
  };
}

describe('CompatibilityIcons', () => {
  it('marks brands with an uploaded file as compatible and others as not', () => {
    render(<CompatibilityIcons files={[file('bambu'), file('snapmaker')]} />);
    expect(screen.getByLabelText('Compatible with Bambu')).toBeTruthy();
    expect(screen.getByLabelText('Compatible with Snapmaker')).toBeTruthy();
    expect(screen.getByLabelText('Not compatible with Flashforge')).toBeTruthy();
  });

  it('marks every brand as not compatible when the job has no files', () => {
    render(<CompatibilityIcons files={[]} />);
    expect(screen.getByLabelText('Not compatible with Bambu')).toBeTruthy();
    expect(screen.getByLabelText('Not compatible with Snapmaker')).toBeTruthy();
    expect(screen.getByLabelText('Not compatible with Flashforge')).toBeTruthy();
  });
});
