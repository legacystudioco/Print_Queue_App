import type { PrinterBrand } from './enums';

/**
 * Single source of truth for supported printer brands: display name and
 * accepted upload file type(s). Drives upload validation, the upload
 * dialog's per-brand sections, assignment options, queue tabs, and the
 * bridge's adapter selection. Adding a new brand starts with a new entry
 * here (plus `printerBrands` in enums.ts and a Postgres enum value).
 */
export interface PrinterDefinition {
  id: PrinterBrand;
  name: string;
  acceptedExtensions: readonly string[];
}

export const PRINTERS: readonly PrinterDefinition[] = [
  { id: 'bambu', name: 'Bambu', acceptedExtensions: ['.gcode.3mf'] },
  { id: 'snapmaker', name: 'Snapmaker', acceptedExtensions: ['.gcode'] },
  { id: 'flashforge', name: 'Flashforge', acceptedExtensions: ['.gcode'] },
] as const;

export function getPrinterDefinition(brand: PrinterBrand): PrinterDefinition {
  const definition = PRINTERS.find((printer) => printer.id === brand);
  if (!definition) {
    throw new Error(`Unknown printer brand: ${brand}`);
  }
  return definition;
}

/** True if `filename` has one of `brand`'s accepted extensions (case-insensitive). */
export function isAcceptedFileName(brand: PrinterBrand, filename: string): boolean {
  const lower = filename.toLowerCase();
  return getPrinterDefinition(brand).acceptedExtensions.some((ext) => lower.endsWith(ext));
}
