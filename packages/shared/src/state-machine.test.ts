import { describe, expect, it } from 'vitest';
import {
  assertCanTransitionJobStatus,
  canTransitionJobStatus,
  IllegalJobStatusTransitionError,
} from './state-machine';

describe('canTransitionJobStatus', () => {
  it('allows the full happy-path pipeline', () => {
    expect(canTransitionJobStatus('queued', 'command_pending')).toBe(true);
    expect(canTransitionJobStatus('command_pending', 'downloading')).toBe(true);
    expect(canTransitionJobStatus('downloading', 'uploading_to_printer')).toBe(true);
    expect(canTransitionJobStatus('uploading_to_printer', 'starting')).toBe(true);
    expect(canTransitionJobStatus('starting', 'printing')).toBe(true);
    expect(canTransitionJobStatus('printing', 'completed')).toBe(true);
  });

  it('allows retry from failed back to queued only', () => {
    expect(canTransitionJobStatus('failed', 'queued')).toBe(true);
    expect(canTransitionJobStatus('failed', 'printing')).toBe(false);
    expect(canTransitionJobStatus('failed', 'command_pending')).toBe(false);
  });

  it('allows any active pipeline state to fail', () => {
    expect(canTransitionJobStatus('command_pending', 'failed')).toBe(true);
    expect(canTransitionJobStatus('downloading', 'failed')).toBe(true);
    expect(canTransitionJobStatus('uploading_to_printer', 'failed')).toBe(true);
    expect(canTransitionJobStatus('starting', 'failed')).toBe(true);
    expect(canTransitionJobStatus('printing', 'failed')).toBe(true);
  });

  it('allows queued to be skipped or cancelled', () => {
    expect(canTransitionJobStatus('queued', 'skipped')).toBe(true);
    expect(canTransitionJobStatus('queued', 'cancelled')).toBe(true);
  });

  it('rejects impossible transitions', () => {
    expect(canTransitionJobStatus('completed', 'printing')).toBe(false);
    expect(canTransitionJobStatus('skipped', 'starting')).toBe(false);
    expect(canTransitionJobStatus('printing', 'queued')).toBe(false);
  });

  it('rejects transitions out of terminal states', () => {
    expect(canTransitionJobStatus('completed', 'queued')).toBe(false);
    expect(canTransitionJobStatus('skipped', 'queued')).toBe(false);
    expect(canTransitionJobStatus('cancelled', 'queued')).toBe(false);
  });

  it('rejects a no-op transition to the same state', () => {
    expect(canTransitionJobStatus('printing', 'printing')).toBe(false);
  });
});

describe('assertCanTransitionJobStatus', () => {
  it('throws IllegalJobStatusTransitionError on an illegal transition', () => {
    expect(() => assertCanTransitionJobStatus('completed', 'printing')).toThrow(
      IllegalJobStatusTransitionError,
    );
  });

  it('does not throw on a legal transition', () => {
    expect(() => assertCanTransitionJobStatus('queued', 'command_pending')).not.toThrow();
  });
});
