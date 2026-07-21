'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { usernameLoginSchema, type UsernameLoginInput } from '@print-queue/shared';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/Button';

const GENERIC_ERROR = 'Invalid username or password';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UsernameLoginInput>({ resolver: zodResolver(usernameLoginSchema) });

  async function onSubmit(values: UsernameLoginInput) {
    setFormError(null);

    // The username-to-account mapping happens entirely server-side — the
    // browser only ever sends what the person typed, never an email.
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setFormError(body.error ?? GENERIC_ERROR);
      return;
    }

    const next = searchParams.get('next') ?? '/dashboard';
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div>
        <label htmlFor="username" className="mb-1 block text-sm font-medium text-slate-700">
          Username
        </label>
        <input
          id="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="h-12 w-full rounded-xl border border-slate-300 px-4 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          {...register('username')}
        />
        {errors.username && <p className="mt-1 text-sm text-danger-600">{errors.username.message}</p>}
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          className="h-12 w-full rounded-xl border border-slate-300 px-4 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          {...register('password')}
        />
        {errors.password && (
          <p className="mt-1 text-sm text-danger-600">{errors.password.message}</p>
        )}
      </div>
      {formError && (
        <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600">
          {formError}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
        Sign in
      </Button>
    </form>
  );
}
