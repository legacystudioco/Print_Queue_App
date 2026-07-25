'use client';

import { hoursMinutesToMinutes, minutesToHoursMinutes, type CreatePrintJobInput } from '@print-queue/shared';
import { Controller, type Control } from 'react-hook-form';

const MAX_HOURS = 999;
const MAX_MINUTES = 59;

/**
 * Two side-by-side numeric inputs (Hours / Minutes) standing in for the
 * single `estimatedDurationSeconds` field — used by both AddPrintForm and
 * EditJobForm so the conversion logic (and the "clamp minutes to 0-59"
 * behavior) exists in exactly one place. Internally this still stores a
 * total-minutes-derived seconds value; only the widget changed. See
 * minutesToHoursMinutes/hoursMinutesToMinutes in @print-queue/shared.
 */
export function PrintTimeFields({
  control,
  error,
}: {
  control: Control<CreatePrintJobInput>;
  error?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">Print Time — optional</label>
      <Controller
        control={control}
        name="estimatedDurationSeconds"
        render={({ field }) => {
          const totalMinutes = field.value ? Math.round(field.value / 60) : 0;
          const { hours, minutes } = minutesToHoursMinutes(totalMinutes);

          function commit(nextHours: number, nextMinutes: number) {
            const clampedHours = Math.min(MAX_HOURS, Math.max(0, Math.round(nextHours) || 0));
            const clampedMinutes = Math.min(MAX_MINUTES, Math.max(0, Math.round(nextMinutes) || 0));
            const total = hoursMinutesToMinutes(clampedHours, clampedMinutes);
            field.onChange(total > 0 ? total * 60 : null);
          }

          return (
            <div className="flex flex-wrap gap-4">
              <div>
                <label htmlFor="print-time-hours" className="mb-1 block text-xs font-medium text-slate-500">
                  Hours
                </label>
                <input
                  id="print-time-hours"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={MAX_HOURS}
                  value={hours}
                  onChange={(e) => commit(Number(e.target.value), minutes)}
                  className="h-11 w-24 rounded-xl border border-slate-300 px-3 text-sm"
                />
              </div>
              <div>
                <label htmlFor="print-time-minutes" className="mb-1 block text-xs font-medium text-slate-500">
                  Minutes
                </label>
                <input
                  id="print-time-minutes"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={MAX_MINUTES}
                  value={minutes}
                  onChange={(e) => commit(hours, Number(e.target.value))}
                  className="h-11 w-24 rounded-xl border border-slate-300 px-3 text-sm"
                />
              </div>
            </div>
          );
        }}
      />
      {error && <p className="mt-1 text-sm text-danger-600">{error}</p>}
    </div>
  );
}
