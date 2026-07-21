import type { JobAmsSlotRecord } from '@print-queue/shared';

export function AmsSummary({ slots }: { slots: JobAmsSlotRecord[] }) {
  const used = [...slots].sort((a, b) => a.slotNumber - b.slotNumber).filter((s) => s.isUsed);

  if (used.length === 0) {
    return <p className="text-sm text-slate-400">External spool / no AMS slots used</p>;
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {used.map((slot) => (
        <li
          key={slot.id}
          className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
        >
          {slot.slotNumber} — {slot.colorName}
          {slot.materialName ? ` ${slot.materialName}` : ''}
        </li>
      ))}
    </ul>
  );
}
