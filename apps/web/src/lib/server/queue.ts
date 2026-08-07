import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PlateRecord } from '@print-queue/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mapPlate } from './mappers';
import { screenshotExists } from './storage';
import type { Database } from '../supabase/database.types';

type AdminClient = SupabaseClient<Database>;
type PlateRow = Database['public']['Tables']['plates']['Row'];

export class PlateNotFoundError extends Error {
  constructor(plateId: string) {
    super(`Plate ${plateId} not found`);
    this.name = 'PlateNotFoundError';
  }
}

export class PlateNotEligibleForRequeueError extends Error {
  constructor() {
    super('Only a completed or partial plate can be requeued.');
    this.name = 'PlateNotEligibleForRequeueError';
  }
}

export class ScreenshotUnavailableError extends Error {
  constructor() {
    super('Original screenshot is no longer available.');
    this.name = 'ScreenshotUnavailableError';
  }
}

type CheckScreenshotExistsFn = (admin: AdminClient, storagePath: string) => Promise<boolean>;
type DuplicatePlateRpcFn = (
  admin: AdminClient,
  args: { p_new_plate_id: string; p_source_plate_id: string },
) => Promise<{ data: PlateRow | null; error: { message: string } | null }>;

const defaultDuplicatePlateRpc: DuplicatePlateRpcFn = async (admin, args) => admin.rpc('duplicate_plate', args);

export interface RequeuePlateResult {
  originalPlateId: string;
  newPlate: PlateRecord;
}

/**
 * Copies a terminal (partial/completed) History plate into a brand-new
 * queued plate under the same job, without ever writing to the source row
 * — see duplicate_plate in supabase/migrations/0018_job_plate_hierarchy.sql.
 * This is the exact same operation as "Duplicate" (see plates/[id]/duplicate
 * route) — Requeue is just that action, offered from History instead of
 * the board.
 *
 * `checkScreenshotExists`/`duplicatePlateRpc` are injectable (default to
 * the real storage check / RPC call) purely so tests can exercise the
 * eligibility logic here without a real Supabase project.
 */
export async function requeuePlateFromHistory(
  admin: AdminClient,
  sourcePlateId: string,
  deps: { checkScreenshotExists?: CheckScreenshotExistsFn; duplicatePlateRpc?: DuplicatePlateRpcFn } = {},
): Promise<RequeuePlateResult> {
  const checkScreenshotExists = deps.checkScreenshotExists ?? screenshotExists;
  const duplicatePlateRpc = deps.duplicatePlateRpc ?? defaultDuplicatePlateRpc;

  const { data: source, error: fetchError } = await admin
    .from('plates')
    .select('id, status, screenshot_path')
    .eq('id', sourcePlateId)
    .maybeSingle();

  if (fetchError) throw new Error(`Failed to load plate ${sourcePlateId}: ${fetchError.message}`);
  if (!source) throw new PlateNotFoundError(sourcePlateId);

  if (source.status !== 'completed' && source.status !== 'partial') {
    throw new PlateNotEligibleForRequeueError();
  }

  if (!source.screenshot_path || !(await checkScreenshotExists(admin, source.screenshot_path))) {
    throw new ScreenshotUnavailableError();
  }

  const { data: newPlateRow, error: duplicateError } = await duplicatePlateRpc(admin, {
    p_new_plate_id: randomUUID(),
    p_source_plate_id: sourcePlateId,
  });

  if (duplicateError || !newPlateRow) {
    throw new Error(`Failed to requeue plate ${sourcePlateId}: ${duplicateError?.message ?? 'no row returned'}`);
  }

  return { originalPlateId: sourcePlateId, newPlate: mapPlate(newPlateRow) };
}
