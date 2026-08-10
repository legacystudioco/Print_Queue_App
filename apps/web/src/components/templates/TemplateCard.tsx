'use client';

import { businessLabels, formatPrintTime, sumTemplatePlateSeconds } from '@print-queue/shared';
import { ImageOff } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LocalTime } from '@/components/ui/LocalTime';
import type { TemplateWithPlates } from './types';

/** One template in the library grid — name, plate count, total time, default business, thumbnail, last updated, and every template-level action. */
export function TemplateCard({
  template,
  isAdmin,
  onUseTemplate,
  onChanged,
}: {
  template: TemplateWithPlates;
  isAdmin: boolean;
  onUseTemplate: (template: TemplateWithPlates) => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const time = sumTemplatePlateSeconds(template.plates);
  const thumbnail = template.plates[0]?.screenshotUrl ?? null;
  const isArchived = template.archivedAt !== null;

  function handleDuplicate() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/templates/${template.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newTemplateId: crypto.randomUUID() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Failed to duplicate template');
        return;
      }
      const { template: created } = (await res.json()) as { template: { id: string } };
      router.push(`/templates/${created.id}`);
    });
  }

  function handleArchiveToggle() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/templates/${template.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !isArchived }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Failed to update template');
        return;
      }
      onChanged();
    });
  }

  function handleDelete() {
    if (!window.confirm(`Permanently delete "${template.name}"? This cannot be undone. Jobs already created from it are not affected.`))
      return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/templates/${template.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Failed to delete template');
        return;
      }
      onChanged();
    });
  }

  return (
    <Card className="flex flex-col gap-3 p-3">
      <div className="flex gap-3">
        {thumbnail ? (
          <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-charcoal-200 bg-charcoal-50">
            <Image src={thumbnail} alt="" fill className="object-cover" unoptimized />
          </span>
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-charcoal-300 bg-charcoal-50 text-charcoal-300">
            <ImageOff className="h-5 w-5" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/templates/${template.id}`} className="truncate text-sm font-bold tracking-tight text-charcoal-900 hover:text-accent-600">
              {template.name}
            </Link>
            {isArchived && (
              <span className="rounded-md bg-charcoal-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-charcoal-500">
                Archived
              </span>
            )}
          </div>
          {template.description && <p className="truncate text-xs text-charcoal-400">{template.description}</p>}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-charcoal-500">
            <span>{businessLabels[template.defaultBusiness]}</span>
            <span>
              {template.plates.length} plate{template.plates.length === 1 ? '' : 's'}
            </span>
            <span>{time.totalMinutes > 0 ? `~${formatPrintTime(time.totalMinutes)}` : '—'}</span>
          </div>
          <p className="text-xs text-charcoal-400">
            Updated <LocalTime iso={template.updatedAt} />
          </p>
        </div>
      </div>

      {error && <p className="text-xs font-medium text-danger-600">{error}</p>}

      {isAdmin && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-charcoal-100 pt-2">
          <Button
            type="button"
            size="md"
            className="h-8 flex-1 px-2.5 text-xs"
            disabled={isArchived}
            onClick={() => onUseTemplate(template)}
          >
            Use Template
          </Button>
          <Link
            href={`/templates/${template.id}`}
            className="touch-target inline-flex h-8 items-center rounded-lg border border-charcoal-300 px-2.5 text-xs font-bold tracking-wide text-charcoal-700 transition-colors hover:border-charcoal-500 hover:bg-charcoal-50"
          >
            Edit
          </Link>
          <Button type="button" variant="secondary" size="md" className="h-8 px-2.5 text-xs" disabled={isPending} onClick={handleDuplicate}>
            Duplicate
          </Button>
          <Button type="button" variant="secondary" size="md" className="h-8 px-2.5 text-xs" disabled={isPending} onClick={handleArchiveToggle}>
            {isArchived ? 'Restore' : 'Archive'}
          </Button>
          <Button type="button" variant="danger" size="md" className="h-8 px-2.5 text-xs" disabled={isPending} onClick={handleDelete}>
            Delete
          </Button>
        </div>
      )}
    </Card>
  );
}
