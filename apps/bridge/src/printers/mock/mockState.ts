import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Cross-process simulated printer state for MockPrinterAdapter.
 *
 * Persisted as JSON in TEMP_DIRECTORY so `pnpm --filter bridge sim` (a
 * separate CLI invocation) can nudge the running bridge process — forcing a
 * completion, a failure, or an offline printer — without any sockets/IPC.
 * The bridge re-reads this file on every status check.
 */
export interface MockState {
  offline: boolean;
  status: 'idle' | 'preparing' | 'printing' | 'paused' | 'completed' | 'failed';
  currentFileName: string | null;
  startedAt: number | null;
  durationMs: number;
  forcedOutcome: 'complete' | 'fail' | null;
  failureMessage: string | null;
  /** Elapsed ms into the print at the moment it was paused, so resume can restore progress. */
  pausedElapsedMs: number | null;
}

const DEFAULT_STATE: MockState = {
  offline: false,
  status: 'idle',
  currentFileName: null,
  startedAt: null,
  durationMs: 30_000,
  forcedOutcome: null,
  failureMessage: null,
  pausedElapsedMs: null,
};

function statePath(tempDirectory: string): string {
  return path.join(tempDirectory, 'mock-printer-state.json');
}

export async function readMockState(tempDirectory: string): Promise<MockState> {
  try {
    const raw = await fs.readFile(statePath(tempDirectory), 'utf-8');
    return { ...DEFAULT_STATE, ...(JSON.parse(raw) as Partial<MockState>) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export async function writeMockState(tempDirectory: string, state: MockState): Promise<void> {
  await fs.mkdir(tempDirectory, { recursive: true });
  await fs.writeFile(statePath(tempDirectory), JSON.stringify(state, null, 2));
}

export async function updateMockState(
  tempDirectory: string,
  patch: Partial<MockState>,
): Promise<MockState> {
  const current = await readMockState(tempDirectory);
  const next = { ...current, ...patch };
  await writeMockState(tempDirectory, next);
  return next;
}
