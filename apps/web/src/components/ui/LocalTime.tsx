'use client';

import { useEffect, useState } from 'react';
import { DATE_TIME, formatDateTime } from '@/lib/client/dateTime';

/**
 * Renders a `timestamptz` value in the *visitor's* local timezone — never
 * the server's. Formatting only happens client-side, in a post-mount
 * effect: both the server-rendered HTML and React's first client render
 * show `fallback`, so there is nothing for hydration to mismatch on. The
 * real local time replaces it a tick later, deliberately — there is no way
 * to know the browser's timezone before the browser has rendered anything.
 *
 * This is what fixed the "Last Heartbeat" dashboard tile showing the
 * server's UTC clock instead of the operator's local time — see
 * lib/client/dateTime.ts for why the underlying data was never the problem.
 */
export function LocalTime({
  iso,
  options = DATE_TIME,
  fallback = '—',
  className,
}: {
  iso: string | null | undefined;
  options?: Intl.DateTimeFormatOptions;
  fallback?: string;
  className?: string;
}) {
  const [formatted, setFormatted] = useState<string | null>(null);

  useEffect(() => {
    setFormatted(formatDateTime(iso, options));
  }, [iso, options]);

  return <span className={className}>{formatted ?? fallback}</span>;
}
