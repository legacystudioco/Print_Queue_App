import type { ReactNode } from 'react';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
      <span
        className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-brand-600"
        aria-hidden="true"
      />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 py-16 text-center">
      <p className="text-base font-semibold text-slate-900">{title}</p>
      {description && <p className="max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-danger-500/30 bg-danger-50 py-16 text-center">
      <p className="text-base font-semibold text-danger-600">{title}</p>
      {description && <p className="max-w-sm text-sm text-danger-600/80">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
