'use client';

import { AddJobForm, type AddJobPresetFile } from '@/app/(app)/queue/add/AddJobForm';
import { Modal } from '@/components/ui/Modal';

/** Thin wrapper around AddJobForm — opened from the hero's "+ Add New" button, an empty column's placeholder, or a file dropped onto a column. */
export function AddJobDialog({
  open,
  onClose,
  presetFile,
}: {
  open: boolean;
  onClose: () => void;
  presetFile?: AddJobPresetFile;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Add Job">
      <AddJobForm onSuccess={onClose} presetFile={presetFile} />
    </Modal>
  );
}
