'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Re-fetches the dashboard's server-rendered data whenever any configured
 * printer's row changes — in particular when `current_job_id` clears (a
 * print just completed) or `status`/`last_seen_at` update. Without this,
 * "current job becomes completed, next queue item is shown" would only be
 * true after a manual reload; someone sitting on the dashboard when a print
 * finishes would otherwise see stale state until they refresh. Renders
 * nothing.
 */
export function DashboardRealtimeRefresh({ printerIds }: { printerIds: string[] }) {
  const router = useRouter();
  const key = printerIds.join(',');

  useEffect(() => {
    if (printerIds.length === 0) return;

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`dashboard-printers-${key}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'printers', filter: `id=in.(${printerIds.join(',')})` },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, router]);

  return null;
}
