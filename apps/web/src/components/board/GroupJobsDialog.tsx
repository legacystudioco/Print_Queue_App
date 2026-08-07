'use client';

import { Modal } from '@/components/ui/Modal';
import { GroupJobsWizard } from './GroupJobsWizard';

/** "Group Existing Jobs" — see GroupJobsWizard for the 3-step flow this wraps. */
export function GroupJobsDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Group Existing Jobs">
      {/* Modal returns null while closed, unmounting this subtree — so the wizard's step/selection state is fresh every time it reopens, same as AddJobDialog/AddJobForm. */}
      <GroupJobsWizard onDone={onDone} />
    </Modal>
  );
}
