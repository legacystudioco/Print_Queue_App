import { z } from 'zod';
import { businessSchema, boardJobStatusSchema } from '../board';

export const MAX_SCREENSHOT_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB — generous for a phone photo

const ACCEPTED_SCREENSHOT_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.heic', '.heif'];

export const screenshotFileNameSchema = z
  .string()
  .trim()
  .min(1, 'File name is required')
  .refine((name) => ACCEPTED_SCREENSHOT_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext)), {
    message: `File must be an image (${ACCEPTED_SCREENSHOT_EXTENSIONS.join(', ')})`,
  });

export const screenshotFileSizeSchema = z
  .number()
  .int()
  .positive('File appears to be empty')
  .max(MAX_SCREENSHOT_SIZE_BYTES, 'Image is larger than the 20 MB limit');

/** Body for POST /api/jobs — creating a board job. */
export const createBoardJobSchema = z.object({
  name: z.string().trim().min(1, 'Job name is required').max(120),
  business: businessSchema,
  screenshotPath: z.string().trim().min(1, 'A screenshot is required'),
  colors: z.string().trim().max(300).nullable().optional(),
  estimatedDurationSeconds: z.number().int().positive().max(60 * 60 * 24 * 7).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export type CreateBoardJobInput = z.infer<typeof createBoardJobSchema>;

/** Body for PATCH /api/jobs/[id]. */
export const updateBoardJobSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  screenshotPath: z.string().trim().min(1).optional(),
  colors: z.string().trim().max(300).nullable().optional(),
  estimatedDurationSeconds: z.number().int().positive().max(60 * 60 * 24 * 7).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export type UpdateBoardJobInput = z.infer<typeof updateBoardJobSchema>;

/** Body for POST /api/queue/reorder. */
export const reorderBoardQueueSchema = z.object({
  business: businessSchema,
  orderedJobIds: z.array(z.string().uuid()).min(1),
});
export type ReorderBoardQueueInput = z.infer<typeof reorderBoardQueueSchema>;

/** Body for POST /api/jobs/[id]/move-business — dragging a card to the other column. */
export const moveJobBusinessSchema = z.object({
  business: businessSchema,
});
export type MoveJobBusinessInput = z.infer<typeof moveJobBusinessSchema>;

/** Body for POST /api/jobs/[id]/status — Start Printing / Complete / Partial. */
export const setJobBoardStatusSchema = z.object({
  status: boardJobStatusSchema,
});
export type SetJobBoardStatusInput = z.infer<typeof setJobBoardStatusSchema>;

/** Body for POST /api/jobs/[id]/partial-reprint. */
export const createPartialReprintSchema = z.object({
  screenshotPath: z.string().trim().min(1, 'A screenshot of the failed parts is required'),
});
export type CreatePartialReprintInput = z.infer<typeof createPartialReprintSchema>;
