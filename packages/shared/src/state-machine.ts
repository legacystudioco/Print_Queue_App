import type { PrintJobStatus } from './enums';

/**
 * Centralized legal-transition table for print job statuses.
 *
 * `ready` and `queued` are treated as siblings (a job flips between them as
 * queue position / eligibility is recomputed) rather than a strict one-way
 * hop, but every other edge is a one-way pipeline step. Terminal statuses
 * (`completed`, `skipped`, `cancelled`) have no outgoing edges. `failed` can
 * only re-enter the pipeline via an explicit retry back to `queued`.
 */
const TRANSITIONS: Record<PrintJobStatus, readonly PrintJobStatus[]> = {
  uploaded: ['queued', 'cancelled'],
  queued: ['ready', 'command_pending', 'skipped', 'cancelled'],
  ready: ['queued', 'command_pending', 'skipped', 'cancelled'],
  command_pending: ['downloading', 'failed', 'cancelled'],
  downloading: ['uploading_to_printer', 'failed', 'cancelled'],
  uploading_to_printer: ['starting', 'failed', 'cancelled'],
  starting: ['printing', 'failed', 'cancelled'],
  printing: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: ['queued'],
  skipped: [],
  cancelled: [],
};

/** Returns whether transitioning a job from `from` to `to` is legal. */
export function canTransitionJobStatus(from: PrintJobStatus, to: PrintJobStatus): boolean {
  if (from === to) return false;
  return TRANSITIONS[from].includes(to);
}

/**
 * Asserts a transition is legal, throwing a descriptive error otherwise.
 * Use this at every call site that mutates job status so illegal jumps
 * (e.g. `completed` -> `printing`) fail loudly instead of corrupting state.
 */
export function assertCanTransitionJobStatus(from: PrintJobStatus, to: PrintJobStatus): void {
  if (!canTransitionJobStatus(from, to)) {
    throw new IllegalJobStatusTransitionError(from, to);
  }
}

export class IllegalJobStatusTransitionError extends Error {
  readonly from: PrintJobStatus;
  readonly to: PrintJobStatus;

  constructor(from: PrintJobStatus, to: PrintJobStatus) {
    super(`Illegal print job status transition: "${from}" -> "${to}"`);
    this.name = 'IllegalJobStatusTransitionError';
    this.from = from;
    this.to = to;
  }
}

/** All statuses reachable from `from` in exactly one legal transition. */
export function legalNextJobStatuses(from: PrintJobStatus): readonly PrintJobStatus[] {
  return TRANSITIONS[from];
}
