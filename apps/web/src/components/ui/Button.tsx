import { clsx } from 'clsx';
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'md' | 'lg' | 'xl';

/**
 * Button system: orange primary (the one accent color that gets to shout),
 * charcoal-outlined secondary, red-outlined danger (a confirm click, not a
 * loud red block), and a quiet ghost for tertiary actions. Every enabled
 * variant gets the same small hover "lift" — a 1px rise plus a slightly
 * deeper shadow — so interaction feedback feels consistent everywhere.
 */
const variantClasses: Record<Variant, string> = {
  primary:
    'bg-accent-500 text-white shadow-panel hover:bg-accent-600 hover:-translate-y-px hover:shadow-panel-lift active:translate-y-0 disabled:bg-charcoal-100 disabled:text-charcoal-400 disabled:shadow-none',
  secondary:
    'bg-white text-charcoal-900 border-2 border-charcoal-300 hover:border-charcoal-500 hover:bg-charcoal-50 hover:-translate-y-px active:translate-y-0 disabled:border-charcoal-100 disabled:text-charcoal-300 disabled:bg-white',
  danger:
    'bg-white text-danger-600 border-2 border-danger-500/70 hover:bg-danger-50 hover:border-danger-600 hover:-translate-y-px active:translate-y-0 disabled:border-charcoal-100 disabled:text-charcoal-300 disabled:bg-white',
  ghost: 'bg-transparent text-charcoal-700 hover:bg-charcoal-100 disabled:text-charcoal-300',
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
        'touch-target inline-flex items-center justify-center gap-2 rounded-lg font-semibold tracking-wide transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:translate-y-0 disabled:hover:translate-y-0',
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
