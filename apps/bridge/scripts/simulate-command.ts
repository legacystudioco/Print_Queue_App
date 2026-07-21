#!/usr/bin/env tsx
/**
 * Poke the running bridge's MockPrinterAdapter from another terminal.
 *
 * Usage (run from apps/bridge, with the bridge running in mock mode):
 *   pnpm sim complete            # force the current print to finish now
 *   pnpm sim fail "nozzle jam"   # force the current print to fail
 *   pnpm sim offline             # simulate the printer dropping off the network
 *   pnpm sim online              # bring it back online
 *   pnpm sim reset               # back to idle, clears forced outcomes
 */
import 'dotenv/config';
import { updateMockState } from '../src/printers/mock/mockState.js';

const TEMP_DIRECTORY = process.env.TEMP_DIRECTORY ?? './tmp';

async function main() {
  const [command, arg] = process.argv.slice(2);

  switch (command) {
    case 'complete':
      await updateMockState(TEMP_DIRECTORY, { forcedOutcome: 'complete' });
      console.log('Forced the current print to complete.');
      break;
    case 'fail':
      await updateMockState(TEMP_DIRECTORY, {
        forcedOutcome: 'fail',
        failureMessage: arg ?? 'Simulated failure',
      });
      console.log(`Forced the current print to fail: ${arg ?? 'Simulated failure'}`);
      break;
    case 'offline':
      await updateMockState(TEMP_DIRECTORY, { offline: true });
      console.log('Mock printer is now offline.');
      break;
    case 'online':
      await updateMockState(TEMP_DIRECTORY, { offline: false });
      console.log('Mock printer is back online.');
      break;
    case 'reset':
      await updateMockState(TEMP_DIRECTORY, {
        offline: false,
        status: 'idle',
        currentFileName: null,
        startedAt: null,
        forcedOutcome: null,
        failureMessage: null,
        pausedElapsedMs: null,
      });
      console.log('Mock printer reset to idle.');
      break;
    default:
      console.error('Usage: pnpm sim <complete|fail [message]|offline|online|reset>');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
