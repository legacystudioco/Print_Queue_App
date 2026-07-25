import type { PrintJobWithSlots } from '@print-queue/shared';
import type { JobDisplayFlags } from '@/lib/server/data';

/** A queued/active/terminal job as rendered on the queue board — shared by QueueBoard, PrinterColumn, ColumnHeader, and QueueCard. */
export type QueueJob = PrintJobWithSlots & JobDisplayFlags;
