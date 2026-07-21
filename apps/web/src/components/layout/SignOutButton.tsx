'use client';

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
      className="touch-target rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
    >
      {loading ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
