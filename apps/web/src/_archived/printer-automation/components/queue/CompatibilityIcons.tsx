import { PRINTERS, type JobFileRecord } from '@print-queue/shared';
import { clsx } from 'clsx';
import Image from 'next/image';
import { PRINTER_LOGOS } from '@/lib/client/printerLogos';

/**
 * Compact per-brand compatibility badges (logo + check/cross) — replaces
 * JobFileList's text-based filename list on the redesigned queue card.
 * JobFileList itself is untouched since the dashboard/job-detail/history
 * pages still use it and are out of scope for this redesign.
 */
export function CompatibilityIcons({ files, className }: { files: JobFileRecord[]; className?: string }) {
  return (
    <ul className={clsx('flex items-center gap-2', className)}>
      {PRINTERS.map((printer) => {
        const compatible = files.some((f) => f.printerBrand === printer.id);
        return (
          <li
            key={printer.id}
            title={printer.name}
            aria-label={`${compatible ? 'Compatible with' : 'Not compatible with'} ${printer.name}`}
            className={clsx(
              'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border sm:h-11 sm:w-11',
              compatible ? 'border-success-500/40 bg-success-50' : 'border-charcoal-200 bg-charcoal-50 opacity-40',
            )}
          >
            <Image
              src={PRINTER_LOGOS[printer.id]}
              alt=""
              width={28}
              height={28}
              className="h-6 w-6 object-contain sm:h-7 sm:w-7"
            />
            <span
              aria-hidden="true"
              className={clsx(
                'absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] leading-none text-white sm:h-5 sm:w-5 sm:text-xs',
                compatible ? 'bg-success-600' : 'bg-danger-600',
              )}
            >
              {compatible ? '✓' : '✕'}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
