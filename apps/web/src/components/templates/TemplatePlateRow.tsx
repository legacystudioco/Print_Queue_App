'use client';

import { formatPrintTime } from '@print-queue/shared';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Copy, GripVertical, ImageOff, Pencil, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useState, useTransition } from 'react';
import type { TemplatePlate } from './types';

const iconButton =
  'touch-target inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-charcoal-300 text-charcoal-700 transition-colors hover:border-charcoal-500 hover:bg-charcoal-50 disabled:opacity-30';

/** One draggable plate row on the template detail page — Edit/Duplicate/Remove, same visual language as the board's PlateRow but with no status/print-lifecycle actions (a template plate is never printed). */
export function TemplatePlateRow({
  templateId,
  plate,
  onEdit,
  onChanged,
}: {
  templateId: string;
  plate: TemplatePlate;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: plate.id });

  function handleDuplicate() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/templates/${templateId}/plates/${plate.id}/duplicate`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Failed to duplicate plate');
        return;
      }
      onChanged();
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/templates/${templateId}/plates/${plate.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Failed to remove plate');
        return;
      }
      onChanged();
    });
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex flex-col gap-1.5 rounded-lg border border-charcoal-100 bg-white p-2"
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${plate.plateName}`}
          className="touch-target -ml-1 mt-1 flex h-7 w-5 shrink-0 cursor-grab items-center justify-center text-charcoal-300 hover:text-charcoal-600 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>

        {plate.screenshotUrl ? (
          <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-charcoal-200 bg-charcoal-50">
            <Image src={plate.screenshotUrl} alt="" fill className="object-cover" unoptimized />
          </span>
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-dashed border-charcoal-300 bg-charcoal-50 text-charcoal-300">
            <ImageOff className="h-4 w-4" aria-hidden="true" />
          </span>
        )}

        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-charcoal-900">{plate.plateName}</span>
            {plate.estimatedDurationSeconds ? (
              <span className="shrink-0 text-xs font-semibold tabular-nums text-charcoal-500">
                {formatPrintTime(Math.round(plate.estimatedDurationSeconds / 60))}
              </span>
            ) : null}
          </div>
          {plate.colors && <p className="truncate text-xs text-charcoal-500">{plate.colors}</p>}
          {plate.notes && <p className="truncate text-xs text-charcoal-400">{plate.notes}</p>}
        </div>
      </div>

      {error && <p className="text-xs font-medium text-danger-600">{error}</p>}
      {!isDragging && (
        <div className="flex items-center gap-1.5 pt-0.5">
          <button type="button" onClick={onEdit} title="Edit" aria-label={`Edit ${plate.plateName}`} className={iconButton}>
            <Pencil className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleDuplicate}
            disabled={isPending}
            title="Duplicate"
            aria-label={`Duplicate ${plate.plateName}`}
            className={iconButton}
          >
            <Copy className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            title="Remove"
            aria-label={`Remove ${plate.plateName}`}
            className="touch-target inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-danger-500/60 text-danger-600 transition-colors hover:bg-danger-50 disabled:opacity-30"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
