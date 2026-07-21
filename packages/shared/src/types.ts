import type {
  PrintJobStatus,
  PrinterCommandStatus,
  PrinterCommandType,
  PrinterStatus,
  UserRole,
} from './enums';

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
  originalFilename: string;
  storagePath: string;
  fileSizeBytes: number;
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

/** A print job joined with its four AMS slots — the shape most UI needs. */
export interface PrintJobWithSlots extends PrintJobRecord {
  amsSlots: JobAmsSlotRecord[];
}
