// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShipByLine } from './ShipByLine';

beforeEach(() => {
  // Local "today" = Aug 14, 2026 — matches the component's internal
  // `new Date()` call, which reads the *local* calendar day.
  vi.setSystemTime(new Date(2026, 7, 14, 9, 0, 0));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ShipByLine', () => {
  it('renders nothing when there is no Ship By date — never an empty row', () => {
    const { container } = render(<ShipByLine shipByDate={null} completed={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows "Ship by: Today" for today\'s date', async () => {
    render(<ShipByLine shipByDate="2026-08-14" completed={false} />);
    expect(await screen.findByText('Ship by: Today')).toBeTruthy();
  });

  it('shows "Ship by: Tomorrow" for the next day', async () => {
    render(<ShipByLine shipByDate="2026-08-15" completed={false} />);
    expect(await screen.findByText('Ship by: Tomorrow')).toBeTruthy();
  });

  it('shows a plain future date without urgency styling beyond the 2-day warning window', async () => {
    render(<ShipByLine shipByDate="2026-08-20" completed={false} />);
    const el = await screen.findByText('Ship by: Aug 20');
    expect(el.className).toContain('text-charcoal-500');
  });

  it('shows "OVERDUE · Ship by <date>" for a past date on an incomplete job', async () => {
    render(<ShipByLine shipByDate="2026-08-12" completed={false} />);
    const el = await screen.findByText('OVERDUE · Ship by Aug 12');
    expect(el.className).toContain('text-danger-600');
  });

  it('a completed job never shows overdue styling or text, even with a past Ship By date', async () => {
    render(<ShipByLine shipByDate="2026-08-12" completed={true} />);
    const el = await screen.findByText('Ship by: Aug 12');
    expect(el.className).not.toContain('text-danger-600');
    expect(screen.queryByText(/overdue/i)).toBeNull();
  });

  it('applies warning styling for a date due within 2 days', async () => {
    render(<ShipByLine shipByDate="2026-08-16" completed={false} />);
    const el = await screen.findByText('Ship by: Aug 16');
    expect(el.className).toContain('text-brand-700');
  });
});
