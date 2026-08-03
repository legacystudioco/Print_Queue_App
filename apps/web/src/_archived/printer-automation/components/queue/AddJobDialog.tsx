'use client';

import type { PrinterBrand, PrinterRecord } from '@print-queue/shared';
import { AddPrintForm } from '@/app/(app)/queue/add/AddPrintForm';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/States';

/**
 * Thin wrapper around the existing AddPrintForm — all upload/validation/
 * submit logic stays there, unmodified. Opened from the hero's "+ Add New"
 * button, an empty column's placeholder, or a file dropped onto one.
 */
export function AddJobDialog({
  open,
  onClose,
  printers,
  presetFile,
}: {
  open: boolean;
  onClose: () => void;
  printers: PrinterRecord[];
  presetFile?: { brand: PrinterBrand; file: File };
}) {
  // A file dropped on a brand with no configured printer has nowhere to
  // land in the form (AddPrintForm only renders a section per configured
  // printer) — still open the dialog, just without the preset.
  const validPreset = presetFile && printers.some((p) => p.brand === presetFile.brand) ? presetFile : undefined;

  return (
    <Modal open={open} onClose={onClose} title="Add Print">
      {printers.length === 0 ? (
        <EmptyState title="No printer configured" description="Add a printer row in Supabase first." />
      ) : (
        <AddPrintForm printers={printers} onSuccess={onClose} presetFile={validPreset} />
      )}
    </Modal>
  );
}
