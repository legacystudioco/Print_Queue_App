import type {
  PrintJobStatus,
  PrinterBrand,
  PrinterCommandStatus,
  PrinterCommandType,
  PrinterStatus,
  UserRole,
} from './enums';
import type { Business, BoardJobStatus, PlateStatus } from './board';

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

/**
 * A customer/order — the Board's card-level entity. camelCase mirror of
 * `jobs` (supabase/migrations/0018_job_plate_hierarchy.sql). `status` /
 * `totalPlateCount` / `completedPlateCount` are deliberately not columns —
 * always derived from `plates` via `deriveJobStatus`/`summarizePlateCounts`.
 * `completedAt` is a stored, one-way stamp: null while on the Board, set
 * once (never cleared) the first time every plate is terminal — see
 * `board.ts` and the migration header comment for the full rationale.
 */
export interface JobRecord {
  id: string;
  customerName: string;
  business: Business;
  notes: string | null;
  queuePosition: number | null;
  createdBy: string;
  createdAt: string;
  completedAt: string | null;
  /** Optional calendar shipping deadline ("YYYY-MM-DD", no time-of-day) — see shipDate.ts. Null = none set. */
  shipByDate: string | null;
}

/**
 * An individual build plate belonging to a job. camelCase mirror of
 * `plates`. `parentPlateId` links a reprint back to the partial plate it
 * followed up on (see `create_plate_reprint`) — never set for a plain
 * duplicate (see `duplicate_plate`).
 */
export interface PlateRecord {
  id: string;
  jobId: string;
  plateName: string;
  screenshotPath: string | null;
  colors: string | null;
  estimatedDurationSeconds: number | null;
  notes: string | null;
  status: PlateStatus;
  parentPlateId: string | null;
  sortOrder: number;
  createdAt: string;
  completedAt: string | null;
}

/** A job joined with all of its plates — the shape the Board/History cards render. */
export interface JobWithPlates extends JobRecord {
  plates: PlateRecord[];
}

/**
 * A reusable recipe of plates — camelCase mirror of `job_templates`
 * (supabase/migrations/0020_job_templates.sql). `defaultBusiness` only
 * prefills "Create Job from Template"'s business field; the user can still
 * change it per job. `archivedAt` is a manual, reversible toggle (unlike
 * `JobRecord.completedAt`'s one-way stamp) — null means active/visible in
 * the library.
 */
export interface JobTemplateRecord {
  id: string;
  name: string;
  description: string | null;
  defaultBusiness: Business;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

/**
 * One reusable plate definition belonging to a template. camelCase mirror
 * of `job_template_plates`. Unlike `PlateRecord`, there is no `status` (a
 * template plate is never printed) and no `parentPlateId` (reprint lineage
 * is a job-only concept).
 */
export interface JobTemplatePlateRecord {
  id: string;
  templateId: string;
  plateName: string;
  screenshotPath: string | null;
  colors: string | null;
  estimatedDurationSeconds: number | null;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** A template joined with all of its plates — the Template Library/detail page's shape. */
export interface JobTemplateWithPlates extends JobTemplateRecord {
  plates: JobTemplatePlateRecord[];
}
