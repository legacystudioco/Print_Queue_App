import { clsx } from 'clsx';
import type { HTMLAttributes } from 'react';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx('rounded-2xl border border-slate-200 bg-white p-4 shadow-sm', className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('mb-3 flex items-center justify-between gap-2', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={clsx('text-base font-semibold text-slate-900', className)} {...props} />;
}
