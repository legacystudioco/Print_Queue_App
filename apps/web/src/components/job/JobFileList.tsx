import { PRINTERS, type JobFileRecord } from '@print-queue/shared';
import { clsx } from 'clsx';

/**
 * Renders a job's uploaded per-brand files against the full printer
 * catalog — ✅/❌ per brand, filename for whichever brands have one. Shared
 * by QueueCard, the dashboard's Next Print block, and the job detail page
 * so this checklist isn't reimplemented per surface.
 */
export function JobFileList({ files, className }: { files: JobFileRecord[]; className?: string }) {
  return (
    <ul className={clsx('flex flex-wrap gap-x-4 gap-y-1', className)}>
      {PRINTERS.map((printer) => {
        const file = files.find((f) => f.printerBrand === printer.id);
        return (
          <li key={printer.id} className="flex min-w-0 items-center gap-1.5 text-xs">
            <span aria-hidden="true">{file ? '✅' : '❌'}</span>
            <span className={clsx('font-semibold', file ? 'text-charcoal-700' : 'text-charcoal-300')}>
              {printer.name}
            </span>
            {file && <span className="truncate font-mono text-charcoal-400">{file.filename}</span>}
          </li>
        );
      })}
    </ul>
  );
}
