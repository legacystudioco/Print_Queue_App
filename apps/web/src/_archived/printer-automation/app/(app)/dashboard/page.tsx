import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/ui/States';
import { DashboardRealtimeRefresh } from '@/components/dashboard/DashboardRealtimeRefresh';
import { PrinterDashboardCard } from '@/components/dashboard/PrinterDashboardCard';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  getActiveQueue,
  getAllPrinters,
  getCurrentJob,
  getNextEligibleJob,
  getRecentPrinterEvents,
} from '@/lib/server/data';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const printers = await getAllPrinters(supabase);

  if (printers.length === 0) {
    return (
      <EmptyState
        title="No printer configured yet"
        description="Ask an admin to add a printer row in Supabase to get started."
      />
    );
  }

  const perPrinter = await Promise.all(
    printers.map(async (printer) => {
      const [currentJob, nextJob, queue, events] = await Promise.all([
        getCurrentJob(supabase, printer.id),
        getNextEligibleJob(supabase, printer.id),
        getActiveQueue(supabase, printer.id),
        getRecentPrinterEvents(supabase, printer.id, 5),
      ]);

      const latestProgressEvent = events.find(
        (e) => e.event_type === 'status_report' && currentJob && e.print_job_id === currentJob.id,
      );
      const progressPercent =
        latestProgressEvent && typeof latestProgressEvent.payload === 'object'
          ? (latestProgressEvent.payload as { progressPercent?: number } | null)?.progressPercent
          : undefined;

      const queuedCount = queue.filter((j) => j.status === 'queued' || j.status === 'ready').length;

      return { printer, currentJob, nextJob, queuedCount, progressPercent };
    }),
  );

  return (
    <div className="space-y-8">
      <DashboardRealtimeRefresh printerIds={printers.map((p) => p.id)} />
      {perPrinter.map(({ printer, currentJob, nextJob, queuedCount, progressPercent }) => (
        <PrinterDashboardCard
          key={printer.id}
          printer={printer}
          currentJob={currentJob}
          nextJob={nextJob}
          queuedCount={queuedCount}
          progressPercent={progressPercent}
        />
      ))}

      <Link
        href="/queue"
        className="flex items-center justify-center gap-1 py-2 text-sm font-bold text-charcoal-600 hover:text-accent-600"
      >
        View full queue
        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
      </Link>
    </div>
  );
}
