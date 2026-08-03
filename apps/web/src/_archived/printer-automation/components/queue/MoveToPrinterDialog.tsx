'use client';

import { getPrinterDefinition, type JobFileRecord, type PrinterRecord } from '@print-queue/shared';
import { ArrowRightLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

/**
 * "Move To" / steal-print: reassign a not-yet-started job to a different
 * printer whose brand already has an uploaded file on this job. No
 * conversion, no re-upload — the bridge just downloads that existing file
 * next time. See reassign_job_printer in supabase/migrations. Self-contained
 * (refreshes the route itself), so it can be dropped into any job view —
 * QueueCard, the job detail page — without extra wiring.
 */
export function MoveToPrinterDialog({
  jobId,
  currentPrinterId,
  files,
  printers,
  onMoved,
}: {
  jobId: string;
  currentPrinterId: string;
  files: JobFileRecord[];
  printers: PrinterRecord[];
  onMoved?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const eligiblePrinters = printers.filter(
    (p) => p.id !== currentPrinterId && files.some((f) => f.printerBrand === p.brand),
  );

  if (eligiblePrinters.length === 0) return null;

  function handleMove(newPrinterId: string) {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/jobs/${jobId}/reassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPrinterId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Could not move this job');
        return;
      }
      setOpen(false);
      router.refresh();
      onMoved?.();
    });
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className="touch-target inline-flex items-center gap-1.5 rounded-lg border border-charcoal-300 px-3 text-sm font-semibold text-charcoal-700 transition-colors hover:border-charcoal-500 hover:bg-charcoal-50 disabled:opacity-30"
      >
        <ArrowRightLeft className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
        Move To
      </button>
      {open && (
        <div className="absolute z-10 mt-1 min-w-[10rem] rounded-lg border border-charcoal-200 bg-white py-1 shadow-panel-lift">
          {eligiblePrinters.map((printer) => (
            <button
              key={printer.id}
              type="button"
              onClick={() => handleMove(printer.id)}
              disabled={isPending}
              className="block w-full px-3 py-2 text-left text-sm font-medium text-charcoal-700 hover:bg-charcoal-50 disabled:opacity-50"
            >
              {getPrinterDefinition(printer.brand).name}
            </button>
          ))}
        </div>
      )}
      {error && <p className="mt-1 text-xs font-medium text-danger-600">{error}</p>}
    </div>
  );
}
