'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      disabled={loading}
      aria-label="Sign out"
      className="touch-target inline-flex items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-charcoal-300 transition-colors hover:bg-charcoal-900 hover:text-white disabled:opacity-50"
    >
      <LogOut className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
      <span className="hidden sm:inline">{loading ? 'Signing out…' : 'Sign out'}</span>
    </button>
  );
}
