import { z } from 'zod';
import { businessSchema, plateStatusSchema } from '../board';

export {
  MAX_SCREENSHOT_SIZE_BYTES,
  ACCEPTED_SCREENSHOT_EXTENSIONS,
  ACCEPTED_SCREENSHOT_MIME_TYPES,
  screenshotFileNameSchema,
  screenshotFileSizeSchema,
} from './board-job';

/** A job can be created with 1–20 plates in one save (see the create-job form's Step 2). */
export const MAX_PLATES_PER_JOB = 20;

const plateFieldsSchema = {
  plateName: z.string().trim().min(1, 'Plate name is required').max(120),
  screenshotPath: z.string().trim().min(1, 'A screenshot is required'),
  colors: z.string().trim().max(300).nullable().optional(),
  estimatedDurationSeconds: z.number().int().positive().max(60 * 60 * 24 * 7).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
};

/** One row of the create-job form's plate list. `id` is generated client-side so the screenshot can be uploaded before the job exists. */
export const plateInputSchema = z.object({
  id: z.string().uuid(),
  ...plateFieldsSchema,
});
export type PlateInput = z.infer<typeof plateInputSchema>;

/** Body for POST /api/jobs — creating a customer/order with all of its plates together. */
export const createJobSchema = z.object({
  customerName: z.string().trim().min(1, 'Customer name is required').max(120),
  business: businessSchema,
  notes: z.string().trim().max(1000).nullable().optional(),
  plates: z.array(plateInputSchema).min(1, 'At least one plate is required').max(MAX_PLATES_PER_JOB),
});
export type CreateJobInput = z.infer<typeof createJobSchema>;

/** Body for POST /api/jobs/[id]/plates — adding one plate to an existing job later. */
export const addPlateSchema = z.object(plateFieldsSchema);
export type AddPlateInput = z.infer<typeof addPlateSchema>;

/** Body for PATCH /api/jobs/[id] — editing the customer/order itself. */
export const updateJobSchema = z.object({
  customerName: z.string().trim().min(1).max(120).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export type UpdateJobInput = z.infer<typeof updateJobSchema>;

/** Body for PATCH /api/plates/[id] — editing a single plate. */
export const updatePlateSchema = z.object({
  plateName: z.string().trim().min(1).max(120).optional(),
  screenshotPath: z.string().trim().min(1).optional(),
  colors: z.string().trim().max(300).nullable().optional(),
  estimatedDurationSeconds: z.number().int().positive().max(60 * 60 * 24 * 7).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export type UpdatePlateInput = z.infer<typeof updatePlateSchema>;

/** Body for POST /api/jobs/[id]/move-business — dragging a customer card to the other business column. */
export const moveJobBusinessSchema = z.object({
  business: businessSchema,
});
export type MoveJobBusinessInput = z.infer<typeof moveJobBusinessSchema>;

/** Body for POST /api/queue/reorder — reordering customer cards within one business's active queue. */
export const reorderJobsQueueSchema = z.object({
  business: businessSchema,
  orderedJobIds: z.array(z.string().uuid()).min(1),
});
export type ReorderJobsQueueInput = z.infer<typeof reorderJobsQueueSchema>;

/** Body for POST /api/plates/[id]/status — Start Printing / Complete / Partial. */
export const setPlateStatusSchema = z.object({
  status: plateStatusSchema,
});
export type SetPlateStatusInput = z.infer<typeof setPlateStatusSchema>;

/** Body for POST /api/plates/[id]/reprint. */
export const createPlateReprintSchema = z.object({
  screenshotPath: z.string().trim().min(1, 'A screenshot of the failed parts is required'),
});
export type CreatePlateReprintInput = z.infer<typeof createPlateReprintSchema>;
