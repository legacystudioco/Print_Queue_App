import { z } from 'zod';

/** Roles supported by the application. Intentionally limited to two. */
export const userRoles = ['admin', 'operator'] as const;
export type UserRole = (typeof userRoles)[number];
export const userRoleSchema = z.enum(userRoles);

export const printerStatuses = [
  'online',
  'offline',
  'idle',
  'preparing',
  'printing',
  'paused',
  'completed',
  'failed',
  'unknown',
] as const;
export type PrinterStatus = (typeof printerStatuses)[number];
export const printerStatusSchema = z.enum(printerStatuses);

/** Lifecycle states for a print job. See state-machine.ts for legal transitions. */
export const printJobStatuses = [
  'uploaded',
  'queued',
  'ready',
  'command_pending',
  'downloading',
  'uploading_to_printer',
  'starting',
  'printing',
  'completed',
  'failed',
  'skipped',
  'cancelled',
] as const;
export type PrintJobStatus = (typeof printJobStatuses)[number];
export const printJobStatusSchema = z.enum(printJobStatuses);

/** Statuses considered "active" — occupy the single printing slot and block new starts. */
export const activePrintJobStatuses: readonly PrintJobStatus[] = [
  'command_pending',
  'downloading',
  'uploading_to_printer',
  'starting',
  'printing',
];

/** Statuses that no longer belong in the active queue view. */
export const terminalPrintJobStatuses: readonly PrintJobStatus[] = [
  'completed',
  'failed',
  'skipped',
  'cancelled',
];

export const printerCommandTypes = [
  'start_print',
  'refresh_status',
  'cancel_print',
  'pause_print',
  'resume_print',
] as const;
export type PrinterCommandType = (typeof printerCommandTypes)[number];
export const printerCommandTypeSchema = z.enum(printerCommandTypes);

export const printerCommandStatuses = [
  'pending',
  'claimed',
  'processing',
  'completed',
  'failed',
  'cancelled',
] as const;
export type PrinterCommandStatus = (typeof printerCommandStatuses)[number];
export const printerCommandStatusSchema = z.enum(printerCommandStatuses);
