'use client';

import { AddJobForm } from '@/app/(app)/queue/add/AddJobForm';
import { Modal } from '@/components/ui/Modal';

/** Thin wrapper around AddJobForm — opened from the hero's "+ Add New" button or an empty column's placeholder. */
export function AddJobDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Add Job">
      <AddJobForm onSuccess={onClose} />
    </Modal>
  );
}
