import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MockPrinterAdapter } from './MockPrinterAdapter.js';
import { updateMockState } from './mockState.js';

describe('MockPrinterAdapter', () => {
  let tempDir: string;
  let adapter: MockPrinterAdapter;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'mock-printer-'));
    adapter = new MockPrinterAdapter(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('starts idle and reports connected', async () => {
    const connection = await adapter.testConnection();
    expect(connection.connected).toBe(true);

    const status = await adapter.getStatus();
    expect(status.status).toBe('idle');
  });

  it('uploads a file and reports progress to completion', async () => {
    const progressUpdates: number[] = [];
    const result = await adapter.uploadPrintFile({
      localFilePath: '/tmp/does-not-need-to-exist.gcode.3mf',
      remoteFileName: 'test.gcode.3mf',
      onProgress: (p) => progressUpdates.push(p),
    });

    expect(result.remoteFileName).toBe('test.gcode.3mf');
    expect(progressUpdates).toEqual([0, 50, 100]);
  });

  it('transitions to printing after startPrint and reports progress over time', async () => {
    await updateMockState(tempDir, { durationMs: 100 });
    const result = await adapter.startPrint({ remoteFileName: 'test.gcode.3mf' });
    expect(result.started).toBe(true);

    const status = await adapter.getStatus();
    expect(status.status).toBe('printing');
    expect(status.currentFileName).toBe('test.gcode.3mf');
  });

  it('naturally completes once the simulated duration elapses', async () => {
    await updateMockState(tempDir, { durationMs: 10 });
    await adapter.startPrint({ remoteFileName: 'test.gcode.3mf' });

    await new Promise((resolve) => setTimeout(resolve, 30));

    const status = await adapter.getStatus();
    expect(status.status).toBe('completed');
  });

  it('can be forced to complete immediately', async () => {
    await updateMockState(tempDir, { durationMs: 60_000 });
    await adapter.startPrint({ remoteFileName: 'test.gcode.3mf' });
    await updateMockState(tempDir, { forcedOutcome: 'complete' });

    const status = await adapter.getStatus();
    expect(status.status).toBe('completed');
  });

  it('can be forced to fail', async () => {
    await updateMockState(tempDir, { durationMs: 60_000 });
    await adapter.startPrint({ remoteFileName: 'test.gcode.3mf' });
    await updateMockState(tempDir, { forcedOutcome: 'fail' });

    const status = await adapter.getStatus();
    expect(status.status).toBe('failed');
  });

  it('reports offline and refuses to upload/start while offline', async () => {
    await updateMockState(tempDir, { offline: true });

    const connection = await adapter.testConnection();
    expect(connection.connected).toBe(false);

    const status = await adapter.getStatus();
    expect(status.status).toBe('offline');

    await expect(adapter.startPrint({ remoteFileName: 'x.gcode.3mf' })).rejects.toThrow();
  });

  it('pauses and resumes, preserving progress', async () => {
    await updateMockState(tempDir, { durationMs: 1000 });
    await adapter.startPrint({ remoteFileName: 'test.gcode.3mf' });

    await new Promise((resolve) => setTimeout(resolve, 100));
    await adapter.pausePrint();

    const pausedStatus = await adapter.getStatus();
    expect(pausedStatus.status).toBe('paused');
    const pausedProgress = pausedStatus.progressPercent ?? 0;
    expect(pausedProgress).toBeGreaterThan(0);

    // Progress should not advance while paused.
    await new Promise((resolve) => setTimeout(resolve, 100));
    const stillPaused = await adapter.getStatus();
    expect(stillPaused.progressPercent).toBe(pausedProgress);

    await adapter.resumePrint();
    const resumedStatus = await adapter.getStatus();
    expect(resumedStatus.status).toBe('printing');
  });

  it('cancels back to idle', async () => {
    await adapter.startPrint({ remoteFileName: 'test.gcode.3mf' });
    await adapter.cancelPrint();

    const status = await adapter.getStatus();
    expect(status.status).toBe('idle');
  });
});
