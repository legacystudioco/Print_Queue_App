import { UnimplementedPrinterAdapter } from '../unimplemented/UnimplementedPrinterAdapter.js';

/**
 * Placeholder — no Flashforge network protocol details are available yet.
 * The file-storage/routing/queue side of Flashforge support is fully wired
 * (job_files, upload validation, queue tabs, assignment); only physical
 * device control remains, once a real protocol integration is written here.
 */
export class FlashforgePrinterAdapter extends UnimplementedPrinterAdapter {
  constructor() {
    super('Flashforge');
  }
}
