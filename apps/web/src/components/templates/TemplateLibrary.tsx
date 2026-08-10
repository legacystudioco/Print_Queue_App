'use client';

import { LayoutTemplate, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/Modal';
import { CreateJobFromTemplateWizard } from '@/components/board/CreateJobFromTemplateWizard';
import { CreateTemplateForm } from './CreateTemplateForm';
import { TemplateCard } from './TemplateCard';
import type { TemplateWithPlates } from './types';

/** The Template Library page: search, a grid of TemplateCards, "Create Template", and "Use Template" (opens the same wizard the board's "New From Template" action uses). */
export function TemplateLibrary({
  initialTemplates,
  isAdmin,
}: {
  initialTemplates: TemplateWithPlates[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initialTemplates);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [useTemplate, setUseTemplate] = useState<TemplateWithPlates | null>(null);

  function refresh() {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    setLoading(true);
    setError(null);
    fetch(`/api/templates?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? 'Failed to load templates');
        }
        return (await res.json()) as { templates: TemplateWithPlates[] };
      })
      .then((body) => setTemplates(body.templates))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load templates'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const timeout = setTimeout(refresh, 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="space-y-6 py-8">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 px-4 text-center">
        <h1 className="text-display-lg tracking-tight text-charcoal-900">Job Templates</h1>
        <p className="text-sm text-charcoal-500">
          Reusable recipes of plates for repeat orders. Create a job from a template in a few clicks instead of
          rebuilding the same plates every time.
        </p>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="touch-target mt-2 inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-5 text-sm font-bold tracking-wide text-white shadow-panel transition-all hover:-translate-y-px hover:bg-accent-600 hover:shadow-panel-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            Create Template
          </button>
        )}
      </div>

      <div className="mx-auto max-w-md px-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-400" aria-hidden="true" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search templates by name…"
            aria-label="Search templates"
            className="h-11 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm"
          />
        </div>
      </div>

      {error && <p className="text-center text-sm font-medium text-danger-600">{error}</p>}

      <div className="grid grid-cols-1 gap-3 px-4 sm:grid-cols-2 lg:grid-cols-3">
        {!loading && templates.length === 0 && !error && (
          <div className="col-span-full flex flex-col items-center gap-2 py-12 text-center text-charcoal-400">
            <LayoutTemplate className="h-8 w-8" aria-hidden="true" />
            <p className="text-sm font-semibold">No templates yet.</p>
          </div>
        )}
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            isAdmin={isAdmin}
            onUseTemplate={setUseTemplate}
            onChanged={refresh}
          />
        ))}
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Template">
        <CreateTemplateForm
          onSuccess={(templateId) => {
            setCreateOpen(false);
            router.push(`/templates/${templateId}`);
          }}
        />
      </Modal>

      <Modal open={useTemplate !== null} onClose={() => setUseTemplate(null)} title="New From Template">
        {useTemplate && (
          <CreateJobFromTemplateWizard
            initialTemplate={useTemplate}
            onDone={() => {
              setUseTemplate(null);
              router.push('/queue');
            }}
          />
        )}
      </Modal>
    </div>
  );
}
