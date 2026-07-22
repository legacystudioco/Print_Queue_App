'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Re-fetches the dashboard's server-rendered data whenever this printer's
 * row changes — in particular when `current_job_id` clears (a print just
 * completed) or `status`/`last_seen_at` update. Without this, "current job
 * becomes completed, next queue item is shown" would only be true after a
 * manual reload; someone sitting on the dashboard when a print finishes
 * would otherwise see stale state until they refresh. Renders nothing.
 */
export function DashboardRealtimeRefresh({ printerId }: { printerId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`dashboard-printer-${printerId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'printers', filter: `id=eq.${printerId}` },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [printerId, router]);

  return null;
}
