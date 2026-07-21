import { Suspense } from 'react';
import { LoginForm } from './LoginForm';

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 safe-top safe-bottom">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Print Queue</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to manage the P1S print queue</p>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
        <p className="mt-6 text-center text-xs text-slate-400">
          Accounts are created by the household admin. There is no public sign-up.
        </p>
      </div>
    </main>
  );
}
