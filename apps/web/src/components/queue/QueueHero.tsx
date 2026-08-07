import { Layers, Plus } from 'lucide-react';

/** Centered page header for the queue board — replaces the old small "Print Queue" title + top-right Add Print button. */
export function QueueHero({
  onAddClick,
  onGroupClick,
  canAdd,
}: {
  onAddClick: () => void;
  onGroupClick: () => void;
  canAdd: boolean;
}) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 px-4 py-8 text-center">
      <h1 className="text-display-lg tracking-tight text-charcoal-900">Production Board</h1>
      <p className="text-sm text-charcoal-500">
        A visual queue of what needs to be printed. Add a job with a screenshot of the build plate, then track
        it through Queued, Printing, and Completed for each business.
      </p>
      <p className="text-xs font-semibold text-charcoal-400">
        Drag and drop to reorder within a column, or move a job to the other business.
      </p>
      {canAdd && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={onAddClick}
            className="touch-target inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-5 text-sm font-bold tracking-wide text-white shadow-panel transition-all hover:-translate-y-px hover:bg-accent-600 hover:shadow-panel-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            Add New
          </button>
          <button
            type="button"
            onClick={onGroupClick}
            className="touch-target inline-flex items-center gap-1.5 rounded-lg border-2 border-charcoal-300 px-5 text-sm font-bold tracking-wide text-charcoal-700 transition-all hover:-translate-y-px hover:border-charcoal-500 hover:bg-charcoal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2"
          >
            <Layers className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            Group Existing Jobs
          </button>
        </div>
      )}
    </div>
  );
}
