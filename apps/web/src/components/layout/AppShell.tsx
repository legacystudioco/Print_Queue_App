import type { AppUser } from '@print-queue/shared';
import Image from 'next/image';
import Link from 'next/link';
import { DesktopNavLinks, MobileNavLinks } from './NavLinks';
import { SignOutButton } from './SignOutButton';

// Intrinsic size of public/logo/mark.png — passed to next/image so it can
// reserve layout space and generate a srcset; actual on-screen size is set
// by the className below (h-9 ≈ 36px tall, within the 36–42px spec).
const LOGO_MARK_WIDTH = 420;
const LOGO_MARK_HEIGHT = 216;

export function AppShell({ user, children }: { user: AppUser; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f1f2f3] pb-20 md:pb-0">
      <header className="safe-top sticky top-0 z-10 bg-charcoal-950">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-2.5">
          <Link href="/queue" className="flex shrink-0 items-center gap-2.5">
            <Image
              src="/logo/mark.png"
              alt="3D Sports Displays"
              width={LOGO_MARK_WIDTH}
              height={LOGO_MARK_HEIGHT}
              priority
              className="h-9 w-auto select-none"
            />
            <span className="hidden flex-col leading-none sm:flex">
              <span className="text-[13px] font-extrabold tracking-[0.14em] text-white">SPORTS</span>
              <span className="text-[13px] font-extrabold tracking-[0.14em] text-accent-500">DISPLAYS</span>
            </span>
          </Link>

          <DesktopNavLinks showAddPrint={user.role === 'admin'} />

          <div className="flex items-center gap-2">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-white">{user.displayName ?? user.email}</p>
              <p className="text-[11px] uppercase tracking-wide text-charcoal-400">{user.role}</p>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-10 flex border-t border-charcoal-800 bg-charcoal-950 md:hidden">
        <MobileNavLinks />
      </nav>
    </div>
  );
}
