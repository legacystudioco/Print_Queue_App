'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AddPlateDialog } from '@/components/board/AddPlateDialog';
import { EditPlateDialog } from '@/components/board/EditPlateDialog';
import { PlateRow } from '@/components/board/PlateRow';
import { Button } from '@/components/ui/Button';
import type { BoardJob, BoardPlate } from '@/components/queue/types';

/** The job detail page's plate list — same PlateRow/AddPlateDialog/EditPlateDialog the board card uses, plus reprint-lineage annotations. */
export function JobDetailPlates({ job, isAdmin }: { job: BoardJob; isAdmin: boolean }) {
  const router = useRouter();
  const [addPlateOpen, setAddPlateOpen] = useState(false);
  const [editingPlate, setEditingPlate] = useState<BoardPlate | null>(null);

  const plateNameById = new Map(job.plates.map((p) => [p.id, p.plateName]));

  return (
    <div className="space-y-2">
      {job.plates.map((plate) => (
        <div key={plate.id} className="space-y-1">
          {plate.parentPlateId && (
            <p className="pl-1 text-xs font-medium text-brand-600">
              ↺ Reprint of {plateNameById.get(plate.parentPlateId) ?? 'a previous plate'}
            </p>
          )}
          <PlateRow
            plate={plate}
            isAdmin={isAdmin}
            onChanged={() => router.refresh()}
            onEdit={() => setEditingPlate(plate)}
          />
        </div>
      ))}

      {isAdmin && (
        <Button type="button" variant="secondary" size="md" onClick={() => setAddPlateOpen(true)} className="mt-2">
          <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
          Add Plate
        </Button>
      )}

      <AddPlateDialog
        jobId={job.id}
        open={addPlateOpen}
        onClose={() => setAddPlateOpen(false)}
        onDone={() => {
          setAddPlateOpen(false);
          router.refresh();
        }}
      />
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
    </div>
  );
}
