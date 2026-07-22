import type { JobAmsSlotRecord } from '@print-queue/shared';
import { clsx } from 'clsx';

export function AmsSlotCards({ slots }: { slots: JobAmsSlotRecord[] }) {
  const bySlot = [1, 2, 3, 4].map(
    (n) => slots.find((s) => s.slotNumber === n) ?? null,
  );

  return (
    <div className="grid grid-cols-2 gap-3">
      {bySlot.map((slot, i) => (
        <div
          key={i}
          className={clsx(
            'rounded-lg border-2 p-4',
            slot?.isUsed ? 'border-brand-300 bg-brand-50' : 'border-charcoal-200 bg-charcoal-50',
          )}
        >
          <p className="text-xs font-bold uppercase tracking-widest text-charcoal-500">Slot {i + 1}</p>
          {slot?.isUsed ? (
            <>
              <p className="mt-1 text-lg font-bold text-charcoal-900">{slot.colorName}</p>
              {slot.materialName && <p className="text-sm text-charcoal-600">{slot.materialName}</p>}
              {slot.notes && <p className="mt-1 text-xs italic text-charcoal-500">{slot.notes}</p>}
            </>
          ) : (
            <p className="mt-1 text-lg font-medium text-charcoal-400">Not used</p>
          )}
        </div>
      ))}
    </div>
  );
}
