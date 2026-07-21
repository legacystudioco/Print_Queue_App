'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@print-queue/shared';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/Button';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginInput) {
    setFormError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword(values);

    if (error) {
      setFormError(
        error.status === 400
          ? 'Incorrect email or password.'
          : 'Unable to sign in right now. Please try again.',
      );
      return;
    }

    const next = searchParams.get('next') ?? '/dashboard';
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          className="h-12 w-full rounded-xl border border-slate-300 px-4 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          {...register('email')}
        />
        {errors.email && <p className="mt-1 text-sm text-danger-600">{errors.email.message}</p>}
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
