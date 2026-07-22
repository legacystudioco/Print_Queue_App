import Image from 'next/image';
import { Suspense } from 'react';
import { LoginForm } from './LoginForm';

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-charcoal-950 px-4 safe-top safe-bottom">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image
            src="/logo/mark.png"
            alt="3D Sports Displays"
            width={420}
            height={228}
            priority
            className="h-14 w-auto select-none"
          />
          <p className="mt-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-charcoal-400">
            Print Queue
          </p>
        </div>
        <div className="rounded-xl border border-charcoal-800 bg-white p-6 shadow-panel-lift">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-6 text-center text-xs text-charcoal-500">
          Accounts are created by the admin. There is no public sign-up.
        </p>
      </div>
    </main>
  );
}
