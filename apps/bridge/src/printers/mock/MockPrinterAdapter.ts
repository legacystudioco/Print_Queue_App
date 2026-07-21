import {
  PrinterAdapterError,
  type PrinterAdapter,
  type PrinterConnectionResult,
  type PrinterStatusReport,
  type StartPrintInput,
  type StartPrintResult,
  type UploadedPrintFile,
  type UploadPrintFileInput,
} from '@print-queue/shared';
import { readMockState, updateMockState } from './mockState.js';

/**
 * Fully simulates the printer lifecycle (idle -> preparing -> printing ->
 * completed/failed, plus pause/resume/cancel/offline) so the entire queue
 * and command pipeline can be exercised without physical hardware. State is
 * persisted to a JSON file under TEMP_DIRECTORY — see mockState.ts and
 * `pnpm --filter bridge sim` for how to poke it from another terminal.
 */
export class MockPrinterAdapter implements PrinterAdapter {
  constructor(private readonly tempDirectory: string) {}

  async testConnection(): Promise<PrinterConnectionResult> {
    const state = await readMockState(this.tempDirectory);
    if (state.offline) {
      return { connected: false, message: 'Mock printer is set offline (see sim --online)' };
    }
    return { connected: true };
  }

  async getStatus(): Promise<PrinterStatusReport> {
    const state = await readMockState(this.tempDirectory);

    if (state.offline) {
      return { status: 'offline' };
    }

    if (state.status === 'idle' || state.status === 'completed' || state.status === 'failed') {
      return {
        status: state.status,
        currentFileName: state.currentFileName ?? undefined,
      };
    }

    if (state.status === 'paused') {
      const elapsed = state.pausedElapsedMs ?? 0;
      return {
        status: 'paused',
        progressPercent: Math.min(100, Math.round((elapsed / state.durationMs) * 100)),
        currentFileName: state.currentFileName ?? undefined,
      };
    }

    // status === 'printing'
    if (state.forcedOutcome === 'fail') {
      return {
        status: 'failed',
        currentFileName: state.currentFileName ?? undefined,
      };
    }

    const elapsed = state.startedAt ? Date.now() - state.startedAt : 0;
    const forcedComplete = state.forcedOutcome === 'complete';
    const naturallyComplete = elapsed >= state.durationMs;

    if (forcedComplete || naturallyComplete) {
      return { status: 'completed', progressPercent: 100, currentFileName: state.currentFileName ?? undefined };
    }

    return {
      status: 'printing',
      progressPercent: Math.min(99, Math.round((elapsed / state.durationMs) * 100)),
      currentFileName: state.currentFileName ?? undefined,
      nozzleTempCelsius: 220,
      bedTempCelsius: 55,
    };
  }

  async uploadPrintFile(input: UploadPrintFileInput): Promise<UploadedPrintFile> {
    const state = await readMockState(this.tempDirectory);
    if (state.offline) {
      throw new PrinterAdapterError('connection_failed', 'Mock printer is offline');
    }

    input.onProgress?.(0);
    await delay(150);
    input.onProgress?.(50);
    await delay(150);
    input.onProgress?.(100);

    return { remoteFileName: input.remoteFileName };
  }

  async startPrint(input: StartPrintInput): Promise<StartPrintResult> {
    const state = await readMockState(this.tempDirectory);
    if (state.offline) {
      throw new PrinterAdapterError('connection_failed', 'Mock printer is offline');
    }

    await updateMockState(this.tempDirectory, {
      status: 'printing',
      currentFileName: input.remoteFileName,
      startedAt: Date.now(),
      forcedOutcome: null,
      failureMessage: null,
      pausedElapsedMs: null,
    });

    return { started: true };
  }

  async pausePrint(): Promise<void> {
    const state = await readMockState(this.tempDirectory);
    if (state.status !== 'printing' || !state.startedAt) return;

    await updateMockState(this.tempDirectory, {
      status: 'paused',
      pausedElapsedMs: Date.now() - state.startedAt,
      startedAt: null,
    });
  }

  async resumePrint(): Promise<void> {
    const state = await readMockState(this.tempDirectory);
    if (state.status !== 'paused') return;

    await updateMockState(this.tempDirectory, {
      status: 'printing',
      startedAt: Date.now() - (state.pausedElapsedMs ?? 0),
      pausedElapsedMs: null,
    });
  }

  async cancelPrint(): Promise<void> {
    await updateMockState(this.tempDirectory, {
      status: 'idle',
      currentFileName: null,
      startedAt: null,
      forcedOutcome: null,
      failureMessage: null,
      pausedElapsedMs: null,
    });
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
