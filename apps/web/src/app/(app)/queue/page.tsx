import { QueueBoard } from '@/components/queue/QueueBoard';
import { getCurrentAppUser } from '@/lib/server/auth';
import { getActiveQueue, getAllPrinters, getRecentPrinterEvents } from '@/lib/server/data';
import { isBridgeOnline } from '@/lib/server/printer-status';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function QueuePage() {
  const supabase = await createSupabaseServerClient();
  const [user, printers, jobs] = await Promise.all([
    getCurrentAppUser(),
    getAllPrinters(supabase),
    getActiveQueue(supabase),
  ]);

  if (!user) return null;

  // Board always renders all 3 brand columns (see QueueBoard's fixed
  // COLUMN_ORDER) even when a brand has no configured printer yet — so,
  // unlike the old page, there's no "no printer configured" early return
  // here.
  const printerStatusEntries = await Promise.all(
    printers.map(async (printer) => {
      const events = await getRecentPrinterEvents(supabase, printer.id, 5);
      const currentJobId = jobs.find((j) => j.printerId === printer.id && j.status !== 'queued' && j.status !== 'ready')
        ?.id;
      const latestProgressEvent = events.find(
        (e) => e.event_type === 'status_report' && currentJobId && e.print_job_id === currentJobId,
      );
      const progressPercent =
        latestProgressEvent && typeof latestProgressEvent.payload === 'object'
          ? (latestProgressEvent.payload as { progressPercent?: number } | null)?.progressPercent
          : undefined;

      return [printer.id, { bridgeOnline: isBridgeOnline(printer.lastSeenAt), progressPercent }] as const;
    }),
  );
  const printerStatus = Object.fromEntries(printerStatusEntries);

  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen">
      <div className="mx-auto max-w-[1600px] px-4 md:px-6">
        <QueueBoard initialJobs={jobs} user={user} printers={printers} printerStatus={printerStatus} />
      </div>
    </div>
  );
}
