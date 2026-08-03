import type { PrinterBrand } from '@print-queue/shared';

/** Maps each printer brand to its logo under public/logo/ — Queue board only. */
export const PRINTER_LOGOS: Record<PrinterBrand, string> = {
  bambu: '/logo/bambu.png',
  snapmaker: '/logo/snapmaker.png',
  flashforge: '/logo/flashforge.png',
};
