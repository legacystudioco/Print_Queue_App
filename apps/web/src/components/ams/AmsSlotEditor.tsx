'use client';

import type { AmsSlotSetInput } from '@print-queue/shared';
import { clsx } from 'clsx';
import type { Control, FieldErrors, FieldValues, Path } from 'react-hook-form';
import { Controller } from 'react-hook-form';

const SLOT_INDEXES = [0, 1, 2, 3] as const;

/** Any form that has a 4-slot `amsSlots` field — both AddPrintForm and EditJobForm qualify. */
export type AmsFormValues = FieldValues & { amsSlots: AmsSlotSetInput };

// react-hook-form's Path<T> can't be verified against a template-literal
// name when T is a generic type parameter (even though `amsSlots` itself is
// concretely typed) — these small casts are the standard workaround for a
// generic form-section component. See AmsFormValues above for the actual
// runtime-relevant type guarantee.
function slotFieldName<T extends AmsFormValues>(index: number, field: string): Path<T> {
  return `amsSlots.${index}.${field}` as Path<T>;
}

export function AmsSlotEditor<T extends AmsFormValues>({
  control,
  errors,
}: {
  control: Control<T>;
  errors: FieldErrors<T>;
}) {
  const slotErrors = errors.amsSlots as unknown as
    | Array<{ colorName?: { message?: string } } | undefined>
    | undefined;

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
              name={slotFieldName<T>(index, 'isUsed')}
              render={({ field }) => (
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={Boolean(field.value)}
                    onChange={(e) => field.onChange(e.target.checked)}
                    className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  Used
                </label>
              )}
            />
          </div>

          <SlotFields control={control} index={index} />

          {slotErrors?.[index]?.colorName && (
            <p className="mt-1 text-xs text-danger-600">{slotErrors[index]?.colorName?.message}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function SlotFields<T extends AmsFormValues>({
  control,
  index,
}: {
  control: Control<T>;
  index: (typeof SLOT_INDEXES)[number];
}) {
  return (
    <Controller
      control={control}
      name={slotFieldName<T>(index, 'isUsed')}
      render={({ field: usedField }) => (
        <div className={clsx('space-y-2', !usedField.value && 'opacity-50')}>
          <Controller
            control={control}
            name={slotFieldName<T>(index, 'colorName')}
            render={({ field }) => (
              <input
                type="text"
                placeholder="Color (e.g. Orange)"
                disabled={!usedField.value}
                value={(field.value as string | null) ?? ''}
                onChange={(e) => field.onChange(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm disabled:bg-slate-50"
              />
            )}
          />
          <Controller
            control={control}
            name={slotFieldName<T>(index, 'materialName')}
            render={({ field }) => (
              <input
                type="text"
                placeholder="Material (e.g. PLA) — optional"
                disabled={!usedField.value}
                value={(field.value as string | null) ?? ''}
                onChange={(e) => field.onChange(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm disabled:bg-slate-50"
              />
            )}
          />
          <Controller
            control={control}
            name={slotFieldName<T>(index, 'notes')}
            render={({ field }) => (
              <input
                type="text"
                placeholder="Notes — optional"
                disabled={!usedField.value}
                value={(field.value as string | null) ?? ''}
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
