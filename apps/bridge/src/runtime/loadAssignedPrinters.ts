import type { BridgeSupabaseClient } from '../lib/supabase.js';
import type { WorkerPrinter } from './PrinterWorker.js';

/**
 * Fetches every enabled physical printer row assigned to this bridge host
 * (`printers.bridge_id = bridgeId`) — shared by BridgeSupervisor (which
 * starts a worker per row) and scripts/diagnose-printers.ts (which reports
 * on the same set without starting anything).
 */
export async function loadAssignedPrinters(
  supabase: BridgeSupabaseClient,
  bridgeId: string,
): Promise<WorkerPrinter[]> {
  const { data: printers, error } = await supabase
    .from('printers')
    .select('id, name, brand')
    .eq('bridge_id', bridgeId)
    .eq('enabled', true);

  if (error) {
    throw new Error(`Failed to load printers for bridge_id=${bridgeId}: ${error.message}`);
  }

  if (!printers || printers.length === 0) {
    throw new Error(
      `No enabled printer rows found with bridge_id="${bridgeId}" — ` +
        'set printers.bridge_id/enabled in Supabase to match BRIDGE_ID.',
    );
  }

  // Defensive de-dup: never return the same printer id twice, even if the
  // query somehow returned a duplicate row.
  const seen = new Set<string>();
  return printers.filter((printer) => {
    if (seen.has(printer.id)) return false;
    seen.add(printer.id);
    return true;
  });
}
