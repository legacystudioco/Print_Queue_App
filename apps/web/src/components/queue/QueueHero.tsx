import { Plus } from 'lucide-react';

/** Centered page header for the queue board — replaces the old small "Print Queue" title + top-right Add Print button. */
export function QueueHero({ onAddClick, canAdd }: { onAddClick: () => void; canAdd: boolean }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 px-4 py-8 text-center">
      <h1 className="text-display-lg tracking-tight text-charcoal-900">Welcome to the Queue</h1>
      <p className="text-sm text-charcoal-500">
        Organize your prints by printer. Upload one or more printer-ready files for each job, then use the
        columns to view everything compatible with Bambu, Snapmaker, or Flashforge.
      </p>
      <p className="text-xs font-semibold text-charcoal-400">
        Drag and drop to reorder within each column, or move jobs between compatible printers.
      </p>
      {canAdd && (
        <button
          type="button"
          onClick={onAddClick}
          className="touch-target mt-2 inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-5 text-sm font-bold tracking-wide text-white shadow-panel transition-all hover:-translate-y-px hover:bg-accent-600 hover:shadow-panel-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
          Add New
        </button>
      )}
    </div>
  );
}
