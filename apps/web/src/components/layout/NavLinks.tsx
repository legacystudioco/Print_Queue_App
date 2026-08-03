'use client';

import { History, LayoutGrid, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';

const NAV_ITEMS = [
  { href: '/queue', label: 'Board', icon: LayoutGrid },
  { href: '/history', label: 'History', icon: History },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop top nav — icon + label, with an orange underline marking the active section. */
export function DesktopNavLinks({ showAddPrint }: { showAddPrint: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-0.5 md:flex">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={clsx(
              'group relative flex items-center gap-2 px-2.5 py-2 text-sm font-semibold tracking-wide transition-colors',
              active ? 'text-white' : 'text-charcoal-300 hover:text-white',
            )}
          >
            <item.icon className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
            {item.label}
            <span
              className={clsx(
                'absolute inset-x-3 -bottom-[1px] h-0.5 rounded-full bg-accent-500 transition-opacity',
                active ? 'opacity-100' : 'opacity-0 group-hover:opacity-40',
              )}
              aria-hidden="true"
            />
          </Link>
        );
      })}
      {showAddPrint && (
        <Link
          href="/queue/add"
          aria-label="Add Print"
          className="ml-2 flex h-7 items-center rounded-md border border-white px-2.5 text-xs font-bold tracking-wide text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-charcoal-950"
        >
          +NEW
        </Link>
      )}
    </nav>
  );
}

/** Mobile bottom tab bar — same items, icon-over-label, orange marks the active tab. */
export function MobileNavLinks() {
  const pathname = usePathname();

  return (
    <>
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={clsx(
              'flex flex-1 flex-col items-center gap-0.5 py-2 transition-colors',
              active ? 'text-accent-500' : 'text-charcoal-400',
            )}
          >
            <item.icon className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />
            <span className="text-[11px] font-semibold tracking-wide">{item.label}</span>
          </Link>
        );
      })}
    </>
  );
}
