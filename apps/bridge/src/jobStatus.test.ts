import { IllegalJobStatusTransitionError } from '@print-queue/shared';
import { describe, expect, it, vi } from 'vitest';
import { transitionJobStatus } from './jobStatus.js';
import { createLogger } from './logger.js';
import type { BridgeSupabaseClient } from './lib/supabase.js';

function fakeSupabase(updateResult: { error: null | { message: string } } = { error: null }) {
  const eq = vi.fn().mockResolvedValue(updateResult);
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });
  return { client: { from } as unknown as BridgeSupabaseClient, update, eq };
}

describe('transitionJobStatus', () => {
  const logger = createLogger('error');

  it('rejects an illegal transition without touching the database', async () => {
    const { client, update } = fakeSupabase();

    await expect(
      transitionJobStatus(client, logger, 'job-1', 'completed', 'printing'),
    ).rejects.toThrow(IllegalJobStatusTransitionError);

    expect(update).not.toHaveBeenCalled();
  });

  it('applies a legal transition and writes the new status', async () => {
    const { client, update } = fakeSupabase();

    await transitionJobStatus(client, logger, 'job-1', 'queued', 'command_pending');

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'command_pending' }));
  });

  it('throws when the database update itself fails', async () => {
    const { client } = fakeSupabase({ error: { message: 'boom' } });

    await expect(
      transitionJobStatus(client, logger, 'job-1', 'queued', 'command_pending'),
    ).rejects.toThrow(/boom/);
  });
});
