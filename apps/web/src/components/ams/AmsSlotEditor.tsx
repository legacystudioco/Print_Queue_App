'use client';

import type { CreatePrintJobInput } from '@print-queue/shared';
import { clsx } from 'clsx';
import type { Control, FieldErrors } from 'react-hook-form';
import { Controller } from 'react-hook-form';

const SLOT_INDEXES = [0, 1, 2, 3] as const;

export function AmsSlotEditor({
  control,
  errors,
}: {
  control: Control<CreatePrintJobInput>;
  errors: FieldErrors<CreatePrintJobInput>;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {SLOT_INDEXES.map((index) => (
        <div
          key={index}
          className="rounded-xl border border-slate-200 p-4"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-900">Slot {index + 1}</span>
            <Controller
              control={control}
              name={`amsSlots.${index}.isUsed`}
              render={({ field }) => (
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                    className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  Used
                </label>
              )}
            />
          </div>

          <SlotFields control={control} index={index} />

          {errors.amsSlots?.[index]?.colorName && (
            <p className="mt-1 text-xs text-danger-600">
              {errors.amsSlots[index]?.colorName?.message}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function SlotFields({
  control,
  index,
}: {
  control: Control<CreatePrintJobInput>;
  index: (typeof SLOT_INDEXES)[number];
}) {
  return (
    <Controller
      control={control}
      name={`amsSlots.${index}.isUsed`}
      render={({ field: usedField }) => (
        <div className={clsx('space-y-2', !usedField.value && 'opacity-50')}>
          <Controller
            control={control}
            name={`amsSlots.${index}.colorName`}
            render={({ field }) => (
              <input
                type="text"
                placeholder="Color (e.g. Orange)"
                disabled={!usedField.value}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm disabled:bg-slate-50"
              />
            )}
          />
          <Controller
            control={control}
            name={`amsSlots.${index}.materialName`}
            render={({ field }) => (
              <input
                type="text"
                placeholder="Material (e.g. PLA) — optional"
                disabled={!usedField.value}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm disabled:bg-slate-50"
              />
            )}
          />
          <Controller
            control={control}
            name={`amsSlots.${index}.notes`}
            render={({ field }) => (
              <input
                type="text"
                placeholder="Notes — optional"
                disabled={!usedField.value}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm disabled:bg-slate-50"
              />
            )}
          />
        </div>
      )}
    />
  );
}
