'use client';

import { clsx } from 'clsx';
import { formatShipDateOnly, getShipDateInfo, localDateOnlyString, type ShipDateUrgency } from '@print-queue/shared';
import { useEffect, useState } from 'react';

const URGENCY_CLASSES: Record<ShipDateUrgency, string> = {
  normal: 'text-charcoal-500',
  soon: 'font-semibold text-brand-700',
  today: 'font-bold text-accent-600',
  overdue: 'font-bold text-danger-600',
};

/**
 * Renders a job's Ship By deadline, or nothing at all when there isn't one
 * — never an empty "Ship by" row. Deliberately understated: colored inline
 * text, not a banner, so an urgent job is easy to scan without the card
 * itself looking alarming (see JobCard/HistoryCard).
 *
 * Same deferred-to-client-effect pattern as <LocalTime>, and for the same
 * reason: "is this Today / overdue?" depends on the *viewer's* local
 * calendar day, which the server can't know. Unlike LocalTime's '—'
 * fallback, the first paint here shows the plain `formatShipDateOnly`
 * label (e.g. "Aug 14") — a pure function of the date string alone, so it
 * can never mismatch between server and client — and a post-mount effect
 * upgrades it to the today-relative label ("Today"/"Overdue · Aug 12")
 * plus urgency styling once the viewer's local date is known.
 */
export function ShipByLine({
  shipByDate,
  completed,
  className,
}: {
  shipByDate: string | null;
  /** Forces urgency to 'normal' regardless of the actual date — a completed job never shows overdue styling. */
  completed: boolean;
  className?: string;
}) {
  const [relative, setRelative] = useState<{ label: string; urgency: ShipDateUrgency } | null>(null);

  useEffect(() => {
    if (!shipByDate) return;
    const info = getShipDateInfo(shipByDate, localDateOnlyString(new Date()));
    setRelative({ label: info.label, urgency: completed ? 'normal' : info.urgency });
  }, [shipByDate, completed]);

  if (!shipByDate) return null;

  const label = relative?.label ?? formatShipDateOnly(shipByDate);
  const urgency = relative?.urgency ?? 'normal';

  return (
    <span className={clsx(URGENCY_CLASSES[urgency], className)}>
      {urgency === 'overdue' ? `OVERDUE · Ship by ${label}` : `Ship by: ${label}`}
    </span>
  );
}
