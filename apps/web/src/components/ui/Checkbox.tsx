import { clsx } from 'clsx';
import type { InputHTMLAttributes } from 'react';

export interface CheckboxRowProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  description?: string;
}

export function CheckboxRow({ label, description, className, id, ...props }: CheckboxRowProps) {
  return (
    <label
      htmlFor={id}
      className={clsx(
        'flex min-h-[56px] cursor-pointer items-start gap-3 rounded-lg border border-charcoal-200 p-4 transition-colors',
        'has-[:checked]:border-accent-500 has-[:checked]:bg-accent-50',
        className,
      )}
    >
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-6 w-6 shrink-0 rounded border-charcoal-300 text-accent-500 focus:ring-accent-500"
        {...props}
      />
      <span>
        <span className="block text-base font-medium text-slate-900">{label}</span>
        {description && <span className="block text-sm text-slate-500">{description}</span>}
      </span>
    </label>
  );
}
