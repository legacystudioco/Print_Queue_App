import { clsx } from 'clsx';
import type { PrintJobStatus, PrinterCommandStatus } from '@print-queue/shared';

/**
 * `ready_on_printer` and `failed_before_upload` aren't real PrintJobStatus
 * values — they're synthetic keys the job pages pass in instead of the raw
 * status when `JobDisplayFlags` (see lib/server/data.ts) says a `printing`
 * job is actually just sitting on the printer waiting for a human, or a
 * `failed` job never made it to a successful upload. See
 * docs/bambu-integration.md.
 */
export type DisplayStatus = PrintJobStatus | PrinterCommandStatus | 'ready_on_printer' | 'failed_before_upload';

const STATUS_STYLES: Record<string, string> = {
  uploaded: 'bg-slate-100 text-slate-700',
  queued: 'bg-slate-100 text-slate-700',
  ready: 'bg-brand-50 text-brand-700',
  command_pending: 'bg-amber-50 text-amber-700',
  downloading: 'bg-amber-50 text-amber-700',
  uploading_to_printer: 'bg-amber-50 text-amber-700',
  starting: 'bg-amber-50 text-amber-700',
  printing: 'bg-brand-100 text-brand-800',
  completed: 'bg-success-50 text-success-600',
  failed: 'bg-danger-50 text-danger-600',
  skipped: 'bg-slate-100 text-slate-500',
  cancelled: 'bg-slate-100 text-slate-500',
  pending: 'bg-amber-50 text-amber-700',
  claimed: 'bg-amber-50 text-amber-700',
  processing: 'bg-brand-100 text-brand-800',
  // Deliberately not brand (real "printing") or success (real "completed") —
  // this needs to read as its own, unmistakable category at a glance.
  ready_on_printer: 'bg-violet-100 text-violet-800',
  failed_before_upload: 'bg-danger-50 text-danger-600',
};

const STATUS_LABELS: Record<string, string> = {
  uploaded: 'Uploaded',
  queued: 'Queued',
  ready: 'Ready',
  command_pending: 'Starting…',
  downloading: 'Downloading',
  uploading_to_printer: 'Uploading to printer',
  starting: 'Starting',
  printing: 'Printing',
  completed: 'Completed',
  failed: 'Failed',
  skipped: 'Skipped',
  cancelled: 'Cancelled',
  pending: 'Pending',
  claimed: 'Claimed',
  processing: 'Processing',
  ready_on_printer: 'Ready on printer — manual start required',
  failed_before_upload: 'Failed (before upload)',
};

export function StatusBadge({
  status,
  className,
}: {
  status: DisplayStatus | string;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
        STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-700',
        className,
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

/** Picks the right badge key for a job, given its raw status and computed display flags. */
export function jobDisplayStatus(
  status: PrintJobStatus,
  flags: { manualStartRequired: boolean; failedBeforeUpload: boolean },
): DisplayStatus {
  if (flags.manualStartRequired) return 'ready_on_printer';
  if (flags.failedBeforeUpload) return 'failed_before_upload';
  return status;
}
