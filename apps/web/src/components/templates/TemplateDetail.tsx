'use client';

import { businessLabels, businesses, formatPrintTime, sumTemplatePlateSeconds, type Business } from '@print-queue/shared';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { AddTemplatePlateDialog } from './AddTemplatePlateDialog';
import { EditTemplatePlateDialog } from './EditTemplatePlateDialog';
import { TemplatePlateRow } from './TemplatePlateRow';
import type { TemplatePlate, TemplateWithPlates } from './types';

/** Template detail/edit page: inline-editable metadata, a drag-reorderable plate list, and every template-level action. Editing here never touches jobs already created from this template — see the API routes' comments. */
export function TemplateDetail({
  initialTemplate,
  isAdmin,
}: {
  initialTemplate: TemplateWithPlates;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [template, setTemplate] = useState(initialTemplate);
  const [name, setName] = useState(initialTemplate.name);
  const [description, setDescription] = useState(initialTemplate.description ?? '');
  const [defaultBusiness, setDefaultBusiness] = useState<Business>(initialTemplate.defaultBusiness);
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [addPlateOpen, setAddPlateOpen] = useState(false);
  const [editingPlate, setEditingPlate] = useState<TemplatePlate | null>(null);
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const time = sumTemplatePlateSeconds(template.plates);
  const isArchived = template.archivedAt !== null;
  const metaDirty =
    name !== template.name || description !== (template.description ?? '') || defaultBusiness !== template.defaultBusiness;

  function refresh() {
    fetch(`/api/templates/${template.id}`)
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as { template: TemplateWithPlates };
        setTemplate(body.template);
      })
      .catch(() => {});
    router.refresh();
  }

  async function handleSaveMeta() {
    setMetaError(null);
    setMetaSaving(true);
    try {
      const res = await fetch(`/api/templates/${template.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: description || null, defaultBusiness }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to save changes');
      }
      refresh();
    } catch (err) {
      setMetaError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setMetaSaving(false);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = template.plates.findIndex((p) => p.id === active.id);
    const newIndex = template.plates.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(template.plates, oldIndex, newIndex);
    setTemplate((prev) => ({ ...prev, plates: reordered }));

    startTransition(async () => {
      const res = await fetch(`/api/templates/${template.id}/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedPlateIds: reordered.map((p) => p.id) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setActionError(body.error ?? 'Failed to save the new order');
        refresh();
      }
    });
  }

  function handleDuplicate() {
    setActionError(null);
    startTransition(async () => {
      const res = await fetch(`/api/templates/${template.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newTemplateId: crypto.randomUUID() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setActionError(body.error ?? 'Failed to duplicate template');
        return;
      }
      const { template: created } = (await res.json()) as { template: { id: string } };
      router.push(`/templates/${created.id}`);
    });
  }

  function handleArchiveToggle() {
    setActionError(null);
    startTransition(async () => {
      const res = await fetch(`/api/templates/${template.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !isArchived }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setActionError(body.error ?? 'Failed to update template');
        return;
      }
      refresh();
    });
  }

  function handleDelete() {
    if (!window.confirm(`Permanently delete "${template.name}"? This cannot be undone. Jobs already created from it are not affected.`))
      return;
    setActionError(null);
    startTransition(async () => {
      const res = await fetch(`/api/templates/${template.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setActionError(body.error ?? 'Failed to delete template');
        return;
      }
      router.push('/templates');
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/templates" className="text-xs font-bold uppercase tracking-widest text-charcoal-400 hover:text-accent-600">
          ← Templates
        </Link>
      </div>

      <Card className="space-y-4">
        {isArchived && (
          <p className="rounded-lg bg-charcoal-100 px-3 py-2 text-xs font-bold uppercase tracking-wide text-charcoal-500">
            Archived — hidden from the library. Restore to use it again.
          </p>
        )}

        <div>
          <label htmlFor="template-detail-name" className="mb-1 block text-sm font-medium text-slate-700">
            Template name
          </label>
          <input
            id="template-detail-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!isAdmin}
            className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
          />
        </div>

        <div>
          <label htmlFor="template-detail-description" className="mb-1 block text-sm font-medium text-slate-700">
            Description — optional
          </label>
          <textarea
            id="template-detail-description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!isAdmin}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="template-detail-business" className="mb-1 block text-sm font-medium text-slate-700">
            Default business
          </label>
          <select
            id="template-detail-business"
            value={defaultBusiness}
            onChange={(e) => setDefaultBusiness(e.target.value as Business)}
            disabled={!isAdmin}
            className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
          >
            {businesses.map((business) => (
              <option key={business} value={business}>
                {businessLabels[business]}
              </option>
            ))}
          </select>
        </div>

        {metaError && <p className="text-sm font-medium text-danger-600">{metaError}</p>}

        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="md" disabled={!metaDirty} loading={metaSaving} onClick={handleSaveMeta}>
              Save Changes
            </Button>
            <Button type="button" variant="secondary" size="md" disabled={isPending} onClick={handleDuplicate}>
              Duplicate Template
            </Button>
            <Button type="button" variant="secondary" size="md" disabled={isPending} onClick={handleArchiveToggle}>
              {isArchived ? 'Restore' : 'Archive'}
            </Button>
            <Button type="button" variant="danger" size="md" disabled={isPending} onClick={handleDelete}>
              Delete
            </Button>
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-charcoal-500">
            Plates ({template.plates.length})
          </h2>
          <p className="text-xs text-charcoal-400">
            {time.totalMinutes > 0 ? `~${formatPrintTime(time.totalMinutes)} total` : 'No estimated time yet'}
          </p>
        </div>

        {actionError && <p className="text-sm font-medium text-danger-600">{actionError}</p>}

        {template.plates.length === 0 ? (
          <p className="py-6 text-center text-sm text-charcoal-400">No plates yet — add the first one below.</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={template.plates.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-1.5">
                {template.plates.map((plate) => (
                  <TemplatePlateRow
                    key={plate.id}
                    templateId={template.id}
                    plate={plate}
                    onEdit={() => setEditingPlate(plate)}
                    onChanged={refresh}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {isAdmin && (
          <button
            type="button"
            onClick={() => setAddPlateOpen(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-charcoal-300 py-3 text-sm font-bold text-charcoal-500 transition-colors hover:border-accent-400 hover:text-accent-600"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            Add Plate
          </button>
        )}
      </Card>

      <AddTemplatePlateDialog
        templateId={template.id}
        open={addPlateOpen}
        onClose={() => setAddPlateOpen(false)}
        onDone={() => {
          setAddPlateOpen(false);
          refresh();
        }}
      />
      {editingPlate && (
        <EditTemplatePlateDialog
          templateId={template.id}
          plate={editingPlate}
          open={editingPlate !== null}
          onClose={() => setEditingPlate(null)}
          onDone={() => {
            setEditingPlate(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
