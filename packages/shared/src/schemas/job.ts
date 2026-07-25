import { z } from 'zod';
import { amsSlotSetInputSchema } from './ams';
import { printerBrandSchema } from '../enums';
import { PRINTERS, isAcceptedFileName } from '../printers';

/** Kept for reuse by Bambu-specific code; the general upload path now
 * validates each file's extension against its brand (see jobFileInputSchema). */
export const GCODE_3MF_EXTENSION = '.gcode.3mf';
export const MAX_UPLOAD_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB — generous for sliced plates

export const printFileNameSchema = z
  .string()
  .trim()
  .min(1, 'File name is required')
  .refine((name) => name.toLowerCase().endsWith(GCODE_3MF_EXTENSION), {
    message: `File must have the ${GCODE_3MF_EXTENSION} extension`,
  });

export const printFileSizeSchema = z
  .number()
  .int()
  .positive('File appears to be empty')
  .max(MAX_UPLOAD_SIZE_BYTES, 'File is larger than the 500 MB limit');

/** Sanitizes an arbitrary uploaded filename into a safe storage-path segment. */
export function sanitizeFileName(rawName: string): string {
  const trimmed = rawName.trim();
  const withoutPath = trimmed.split(/[/\\]/).pop() ?? trimmed;
  return withoutPath.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
}

/** One uploaded printer-specific file, validated against its brand's accepted extension(s). */
export const jobFileInputSchema = z
  .object({
    printerBrand: printerBrandSchema,
    filename: z.string().trim().min(1, 'File name is required'),
    fileSizeBytes: printFileSizeSchema,
    storagePath: z.string().trim().min(1),
  })
  .superRefine((file, ctx) => {
    if (!isAcceptedFileName(file.printerBrand, file.filename)) {
      const accepted = PRINTERS.find((p) => p.id === file.printerBrand)?.acceptedExtensions ?? [];
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `File must have one of these extensions: ${accepted.join(', ')}`,
        path: ['filename'],
      });
    }
  });
export type JobFileInput = z.infer<typeof jobFileInputSchema>;

export const createPrintJobSchema = z
  .object({
    name: z.string().trim().min(1, 'Job name is required').max(120),
    printerId: z.string().uuid(),
    files: z.array(jobFileInputSchema).min(1, 'At least one printer file is required'),
    estimatedDurationSeconds: z.number().int().positive().max(60 * 60 * 24 * 7).nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
    amsSlots: amsSlotSetInputSchema.optional(),
    externalSpoolConfirmed: z.boolean().default(false),
  })
  .superRefine((job, ctx) => {
    const brands = job.files.map((file) => file.printerBrand);
    if (new Set(brands).size !== brands.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Only one file per printer brand',
        path: ['files'],
      });
    }

    const hasBambuFile = brands.includes('bambu');
    if (hasBambuFile) {
      if (!job.amsSlots) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'AMS slot info is required for a Bambu file',
          path: ['amsSlots'],
        });
      } else {
        const anyUsed = job.amsSlots.some((slot) => slot.isUsed);
        if (!anyUsed && !job.externalSpoolConfirmed) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'At least one AMS slot must be used, or confirm this print uses an external spool workflow',
            path: ['amsSlots'],
          });
        }
      }
    } else if (job.amsSlots) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'AMS slots only apply to a Bambu file',
        path: ['amsSlots'],
      });
    }
  });
export type CreatePrintJobInput = z.infer<typeof createPrintJobSchema>;

export const updatePrintJobSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  estimatedDurationSeconds: z.number().int().positive().max(60 * 60 * 24 * 7).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  amsSlots: amsSlotSetInputSchema.optional(),
});
export type UpdatePrintJobInput = z.infer<typeof updatePrintJobSchema>;

/** Body for POST /api/queue/reorder — full ordered list of job ids, scoped to one printer. */
export const reorderQueueSchema = z.object({
  printerId: z.string().uuid(),
  orderedJobIds: z.array(z.string().uuid()).min(1),
});
export type ReorderQueueInput = z.infer<typeof reorderQueueSchema>;

/** Body for POST /api/jobs/[id]/files — "Add Printer File" on an existing job. */
export const addJobFileSchema = jobFileInputSchema;
export type AddJobFileInput = z.infer<typeof addJobFileSchema>;

/** Body for POST /api/jobs/[id]/reassign — "Move To" a different printer. */
export const reassignJobPrinterSchema = z.object({
  newPrinterId: z.string().uuid(),
});
export type ReassignJobPrinterInput = z.infer<typeof reassignJobPrinterSchema>;

export const bedClearChecklistSchema = z.object({
  previousPrintRemoved: z.literal(true, {
    errorMap: () => ({ message: 'Confirm the previous print has been removed' }),
  }),
  buildPlateClear: z.literal(true, {
    errorMap: () => ({ message: 'Confirm the build plate is installed and clear' }),
  }),
  amsVerified: z.literal(true, {
    errorMap: () => ({ message: 'Confirm the AMS slots match the setup shown' }),
  }),
});
export type BedClearChecklistInput = z.infer<typeof bedClearChecklistSchema>;

/** Body for POST /api/jobs/[id]/start-next. */
export const startNextJobSchema = z.object({
  jobId: z.string().uuid(),
  checklist: bedClearChecklistSchema,
  /** Client-generated key so a double-tap / retry never creates two commands. */
  idempotencyKey: z.string().uuid(),
});
export type StartNextJobInput = z.infer<typeof startNextJobSchema>;
