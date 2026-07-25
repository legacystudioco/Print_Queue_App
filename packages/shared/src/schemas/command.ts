import { z } from 'zod';
import { printerCommandTypeSchema } from '../enums';

export const startPrintCommandPayloadSchema = z.object({
  jobId: z.string().uuid(),
  storagePath: z.string().min(1),
  originalFilename: z.string().min(1),
});
export type StartPrintCommandPayload = z.infer<typeof startPrintCommandPayloadSchema>;

/** Same shape as `start_print`: which job/file to deliver. Upload-only, never starts it. */
export const deliverPrintCommandPayloadSchema = startPrintCommandPayloadSchema;
export type DeliverPrintCommandPayload = z.infer<typeof deliverPrintCommandPayloadSchema>;

export const refreshStatusCommandPayloadSchema = z.object({});

export const printerCommandPayloadSchemas = {
  start_print: startPrintCommandPayloadSchema,
  deliver_print: deliverPrintCommandPayloadSchema,
  refresh_status: refreshStatusCommandPayloadSchema,
  cancel_print: z.object({}),
  pause_print: z.object({}),
  resume_print: z.object({}),
} as const;

export const createPrinterCommandSchema = z.object({
  printerId: z.string().uuid(),
  printJobId: z.string().uuid().nullable(),
  commandType: printerCommandTypeSchema,
  idempotencyKey: z.string().min(1),
  payload: z.record(z.unknown()).default({}),
});
export type CreatePrinterCommandInput = z.infer<typeof createPrinterCommandSchema>;
