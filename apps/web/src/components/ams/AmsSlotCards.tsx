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
            'rounded-2xl border-2 p-4',
            slot?.isUsed ? 'border-brand-200 bg-brand-50' : 'border-slate-200 bg-slate-50',
          )}
        >
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Slot {i + 1}</p>
          {slot?.isUsed ? (
            <>
              <p className="mt-1 text-lg font-bold text-slate-900">{slot.colorName}</p>
              {slot.materialName && <p className="text-sm text-slate-600">{slot.materialName}</p>}
              {slot.notes && <p className="mt-1 text-xs italic text-slate-500">{slot.notes}</p>}
            </>
          ) : (
            <p className="mt-1 text-lg font-medium text-slate-400">Not used</p>
          )}
        </div>
      ))}
    </div>
  );
}
