'use client';

import { businessLabels } from '@print-queue/shared';
import { clsx } from 'clsx';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { EditPlateDialog } from '@/components/board/EditPlateDialog';
import { PlateRow } from '@/components/board/PlateRow';
import { Card } from '@/components/ui/Card';
import { LocalTime } from '@/components/ui/LocalTime';
import type { BoardJob, BoardPlate } from '@/components/queue/types';

/** History's card: a customer/order collapsed to its completed/partial/reprint counts, expandable to the full plate list — same status glyphs and per-plate actions (including Requeue) as the board's JobCard. */
export function HistoryCard({
  job,
  creatorName,
  isAdmin,
  screenshotAvailableByPath,
}: {
  job: BoardJob;
  creatorName: string;
  isAdmin: boolean;
  screenshotAvailableByPath: Record<string, boolean>;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [editingPlate, setEditingPlate] = useState<BoardPlate | null>(null);

  const completed = job.plates.filter((p) => p.status === 'completed').length;
  const partial = job.plates.filter((p) => p.status === 'partial').length;
  const reprints = job.plates.filter((p) => p.parentPlateId !== null).length;

  return (
    <Card className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <Link href={`/jobs/${job.id}`} className="block truncate font-semibold text-slate-900 hover:text-accent-600">
            {job.customerName}
          </Link>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>{businessLabels[job.business]}</span>
            <span>
              Completed: {completed} plate{completed === 1 ? '' : 's'}
            </span>
            {partial > 0 && (
              <span>
                Partial: {partial} plate{partial === 1 ? '' : 's'}
              </span>
            )}
            {reprints > 0 && <span>Reprints: {reprints}</span>}
            <span>
              In history since <LocalTime iso={job.completedAt} />
            </span>
            <span>By {creatorName}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse ${job.customerName}` : `Expand ${job.customerName}`}
          className="touch-target inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-charcoal-300 text-charcoal-600 hover:border-charcoal-500 hover:bg-charcoal-50"
        >
          <ChevronDown className={clsx('h-4 w-4 transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
        </button>
      </div>

      {expanded && (
        <div className="space-y-1.5 border-t border-charcoal-100 pt-2">
          {job.plates.map((plate) => (
            <PlateRow
              key={plate.id}
              plate={plate}
              isAdmin={isAdmin}
              onChanged={() => router.refresh()}
              onEdit={() => setEditingPlate(plate)}
              showRequeue
              screenshotAvailable={
                plate.screenshotPath !== null ? (screenshotAvailableByPath[plate.screenshotPath] ?? true) : false
              }
            />
          ))}
        </div>
      )}

      {editingPlate && (
        <EditPlateDialog
          plate={editingPlate}
          open={editingPlate !== null}
          onClose={() => setEditingPlate(null)}
          onDone={() => {
            setEditingPlate(null);
            router.refresh();
          }}
        />
      )}
    </Card>
  );
}
