'use client';

import Image from 'next/image';
import { Modal } from '@/components/ui/Modal';

/** Click-to-enlarge view of a job's build-plate screenshot — the app's primary visual reference for production. */
export function ScreenshotLightbox({
  open,
  onClose,
  screenshotUrl,
  jobName,
}: {
  open: boolean;
  onClose: () => void;
  screenshotUrl: string;
  jobName: string;
}) {
  return (
    <Modal open={open} onClose={onClose} title={jobName}>
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-charcoal-100">
        <Image src={screenshotUrl} alt={`Build plate for ${jobName}`} fill className="object-contain" unoptimized />
      </div>
    </Modal>
  );
}
