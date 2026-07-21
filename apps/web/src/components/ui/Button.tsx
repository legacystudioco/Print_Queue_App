import { clsx } from 'clsx';
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'md' | 'lg' | 'xl';

const variantClasses: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-slate-300',
  secondary: 'bg-white text-slate-900 border border-slate-300 hover:bg-slate-50 disabled:opacity-50',
  danger: 'bg-danger-600 text-white hover:bg-danger-500 disabled:bg-slate-300',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-100 disabled:opacity-50',
};

const sizeClasses: Record<Size, string> = {
  md: 'h-11 px-4 text-sm',
  lg: 'h-14 px-6 text-base',
  xl: 'h-16 px-8 text-lg',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        'touch-target inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading && (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}
