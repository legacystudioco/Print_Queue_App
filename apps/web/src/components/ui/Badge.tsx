import { clsx } from 'clsx';
import type { PrintJobStatus, PrinterCommandStatus } from '@print-queue/shared';

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
};

export function StatusBadge({
  status,
  className,
}: {
  status: PrintJobStatus | PrinterCommandStatus | string;
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
