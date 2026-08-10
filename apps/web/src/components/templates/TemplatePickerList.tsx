'use client';

import { businessLabels, formatPrintTime, sumTemplatePlateSeconds } from '@print-queue/shared';
import { clsx } from 'clsx';
import { ImageOff, Search } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import type { TemplateWithPlates } from './types';

/** Single-select searchable template list — Step 1 of "Create Job from Template" when no template was pre-selected. Mirrors board/JobPickerList's fetch/filter/render shape. */
export function TemplatePickerList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (template: TemplateWithPlates) => void;
}) {
  const [templates, setTemplates] = useState<TemplateWithPlates[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());

      fetch(`/api/templates?${params.toString()}`, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error ?? 'Failed to load templates');
          }
          return (await res.json()) as { templates: TemplateWithPlates[] };
        })
        .then((body) => setTemplates(body.templates))
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setError(err instanceof Error ? err.message : 'Failed to load templates');
        })
        .finally(() => setLoading(false));
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [q]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-400" aria-hidden="true" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search templates by name…"
          aria-label="Search templates"
          className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm"
        />
      </div>

      {error && <p className="text-sm font-medium text-danger-600">{error}</p>}

      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {loading && <p className="py-4 text-center text-sm text-charcoal-400">Loading…</p>}
        {!loading && templates.length === 0 && !error && (
          <p className="py-4 text-center text-sm text-charcoal-400">No templates match your search.</p>
        )}
        {!loading &&
          templates.map((template) => {
            const checked = selectedId === template.id;
            const time = sumTemplatePlateSeconds(template.plates);
            const thumbnail = template.plates[0]?.screenshotUrl ?? null;

            return (
              <label
                key={template.id}
                className={clsx(
                  'flex cursor-pointer items-center gap-3 rounded-lg border border-charcoal-200 p-2.5 transition-colors',
                  'has-[:checked]:border-accent-500 has-[:checked]:bg-accent-50',
                )}
              >
                <input
                  type="radio"
                  name="template-picker"
                  checked={checked}
                  onChange={() => onSelect(template)}
                  className="h-5 w-5 shrink-0 rounded border-charcoal-300 text-accent-500 focus:ring-accent-500"
                />
                {thumbnail ? (
                  <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-charcoal-200 bg-charcoal-50">
                    <Image src={thumbnail} alt="" fill className="object-cover" unoptimized />
                  </span>
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-charcoal-300 bg-charcoal-50 text-charcoal-300">
                    <ImageOff className="h-4 w-4" aria-hidden="true" />
                  </span>
                )}
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span className="block truncate text-sm font-semibold text-charcoal-900">{template.name}</span>
                  <span className="flex flex-wrap gap-x-2 text-xs text-charcoal-500">
                    <span>{businessLabels[template.defaultBusiness]}</span>
                    <span>
                      {template.plates.length} plate{template.plates.length === 1 ? '' : 's'}
                    </span>
                    {time.totalMinutes > 0 && <span>~{formatPrintTime(time.totalMinutes)}</span>}
                  </span>
                </span>
              </label>
            );
          })}
      </div>
    </div>
  );
}
