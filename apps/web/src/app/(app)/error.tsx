'use client';

import { ErrorState } from '@/components/ui/States';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      title="Something went wrong"
      description={error.message || 'Please try again.'}
      action={
        <button
          onClick={reset}
          className="touch-target rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white"
        >
          Try again
        </button>
      }
    />
  );
}
