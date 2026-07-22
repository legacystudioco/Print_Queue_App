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
          className="touch-target rounded-lg bg-accent-500 px-4 text-sm font-bold tracking-wide text-white hover:bg-accent-600"
        >
          Try again
        </button>
      }
    />
  );
}
