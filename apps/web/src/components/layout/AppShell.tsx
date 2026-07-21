import type { AppUser } from '@print-queue/shared';
import Link from 'next/link';
import { SignOutButton } from './SignOutButton';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: '🏠' },
  { href: '/queue', label: 'Queue', icon: '📋' },
  { href: '/start-next', label: 'Start Next', icon: '▶️' },
  { href: '/history', label: 'History', icon: '🕘' },
] as const;

export function AppShell({ user, children }: { user: AppUser; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 pb-20 md:pb-0">
      <header className="safe-top sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="text-lg font-bold text-slate-900">
            Print Queue
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                {item.label}
              </Link>
            ))}
            {user.role === 'admin' && (
              <Link
                href="/queue/add"
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                Add Print
              </Link>
            )}
          </nav>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-900">{user.displayName ?? user.email}</p>
              <p className="text-xs capitalize text-slate-400">{user.role}</p>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-10 flex border-t border-slate-200 bg-white md:hidden">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-slate-600"
          >
            <span aria-hidden="true" className="text-xl">
              {item.icon}
            </span>
            <span className="text-[11px] font-medium">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
