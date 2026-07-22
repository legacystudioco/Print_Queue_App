import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LocalTime } from './LocalTime';

describe('LocalTime', () => {
  it('renders only the fallback during server rendering, never a formatted value', () => {
    // renderToString never runs effects, so this is exactly what a Next.js
    // server render (and React's first client render, pre-hydration) would
    // produce — proving the server can never emit a timezone-dependent
    // string for React to mismatch against once the browser takes over.
    const html = renderToString(<LocalTime iso="2026-07-22T21:48:00Z" />);
    expect(html).toContain('—');
    expect(html).not.toMatch(/\d/);
  });

  it('renders the fallback for a missing timestamp', () => {
    const html = renderToString(<LocalTime iso={null} />);
    expect(html).toContain('—');
  });

  it('supports a custom fallback', () => {
    const html = renderToString(<LocalTime iso={null} fallback="Never" />);
    expect(html).toContain('Never');
    expect(html).not.toContain('—');
  });

  it('renders the fallback even for a garbage timestamp (no crash, no "Invalid Date")', () => {
    const html = renderToString(<LocalTime iso="not-a-real-timestamp" />);
    expect(html).toContain('—');
    expect(html).not.toMatch(/invalid/i);
  });
});
