import type {
  PrintJobStatus,
  PrinterBrand,
  PrinterCommandStatus,
  PrinterCommandType,
  PrinterStatus,
  UserRole,
} from './enums';
import type { Business, BoardJobStatus } from './board';

/**
 * Application-level (camelCase) mirrors of the Postgres tables. These are
 * what server code and UI components work with; mapping to/from the
 * snake_case Supabase rows happens at the data-access boundary.
 */

export interface AppUserRecord {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PrinterRecord {
  id: string;
  name: string;
  model: string;
  brand: PrinterBrand;
  serialNumber: string | null;
  localIp: string | null;
  bridgeId: string | null;
  status: PrinterStatus;
  lastSeenAt: string | null;
  currentJobId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PrintJobRecord {
  id: string;
  printerId: string;
  name: string;
  queuePosition: number | null;
  status: PrintJobStatus;
  estimatedDurationSeconds: number | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failureMessage: string | null;
}

/** One uploaded printer-specific file for a job — see job_files in the schema. */
export interface JobFileRecord {
  id: string;
  jobId: string;
  printerBrand: PrinterBrand;
  filename: string;
  storagePath: string;
  fileSizeBytes: number;
  createdAt: string;
}

export interface JobAmsSlotRecord {
  id: string;
  jobId: string;
  slotNumber: 1 | 2 | 3 | 4;
  colorName: string | null;
  materialName: string | null;
  notes: string | null;
  isUsed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PrinterCommandRecord {
  id: string;
  printerId: string;
  printJobId: string | null;
  commandType: PrinterCommandType;
  status: PrinterCommandStatus;
  requestedBy: string;
  requestedAt: string;
  claimedAt: string | null;
  claimedByBridge: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  attemptCount: number;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
}

export interface PrinterEventRecord {
  id: string;
  printerId: string;
  printJobId: string | null;
  eventType: string;
  message: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface BedClearConfirmationRecord {
  id: string;
  printJobId: string;
  confirmedBy: string;
  previousPrintRemoved: boolean;
  buildPlateClear: boolean;
  amsVerified: boolean;
  createdAt: string;
}

/** A print job joined with its AMS slots and per-brand files — the shape most UI needs. */
export interface PrintJobWithSlots extends PrintJobRecord {
  amsSlots: JobAmsSlotRecord[];
  files: JobFileRecord[];
}

/**
 * A production-board job — the shape the new Kanban board, Add/Edit forms,
 * job detail page, and History work with. camelCase mirror of the board
 * columns added to `print_jobs` by
 * supabase/migrations/0017_production_board.sql.
 */
export interface BoardJobRecord {
  id: string;
  name: string;
  business: Business;
  status: BoardJobStatus;
  screenshotPath: string | null;
  colors: string | null;
  estimatedDurationSeconds: number | null;
  notes: string | null;
  queuePosition: number | null;
  parentJobId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}
