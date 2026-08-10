import { z } from 'zod';
import { businessSchema } from '../board';
import { MAX_PLATES_PER_JOB } from './job-plate';

const templatePlateFieldsSchema = {
  plateName: z.string().trim().min(1, 'Plate name is required').max(120),
  /** Unlike a job plate, a template plate may be created before a screenshot exists — added later via Edit. */
  screenshotPath: z.string().trim().min(1).nullable().optional(),
  colors: z.string().trim().max(300).nullable().optional(),
  estimatedDurationSeconds: z.number().int().positive().max(60 * 60 * 24 * 7).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
};

/** One row of the create-template form's plate list. `id` is generated client-side, same as `plateInputSchema`. */
export const templatePlateInputSchema = z.object({
  id: z.string().uuid(),
  ...templatePlateFieldsSchema,
});
export type TemplatePlateInput = z.infer<typeof templatePlateInputSchema>;

/** Body for POST /api/templates — manual "Create Template" (0+ plates — a template can be built up plate by plate afterward) or the RPC payload prepared by "Save as Template". */
export const createJobTemplateSchema = z.object({
  name: z.string().trim().min(1, 'Template name is required').max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  defaultBusiness: businessSchema,
  plates: z.array(templatePlateInputSchema).max(MAX_PLATES_PER_JOB).default([]),
});
export type CreateJobTemplateInput = z.infer<typeof createJobTemplateSchema>;

/** Body for PATCH /api/templates/[id] — edit metadata, and/or archive or restore it (never affects jobs already created from it). */
export const updateJobTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  defaultBusiness: businessSchema.optional(),
  archived: z.boolean().optional(),
});
export type UpdateJobTemplateInput = z.infer<typeof updateJobTemplateSchema>;

/** Body for POST /api/templates/[id]/plates — adding one plate to an existing template. */
export const addTemplatePlateSchema = z.object(templatePlateFieldsSchema);
export type AddTemplatePlateInput = z.infer<typeof addTemplatePlateSchema>;

/** Body for PATCH /api/templates/[id]/plates/[plateId] — editing a single template plate. */
export const updateTemplatePlateSchema = z.object({
  plateName: z.string().trim().min(1).max(120).optional(),
  screenshotPath: z.string().trim().min(1).nullable().optional(),
  colors: z.string().trim().max(300).nullable().optional(),
  estimatedDurationSeconds: z.number().int().positive().max(60 * 60 * 24 * 7).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export type UpdateTemplatePlateInput = z.infer<typeof updateTemplatePlateSchema>;

/** Body for POST /api/templates/[id]/reorder — drag-and-drop plate reordering on the template detail page. */
export const reorderTemplatePlatesSchema = z.object({
  orderedPlateIds: z.array(z.string().uuid()).min(1),
});
export type ReorderTemplatePlatesInput = z.infer<typeof reorderTemplatePlatesSchema>;

/** Body for POST /api/templates/[id]/duplicate — an independent copy, ready to rename. */
export const duplicateJobTemplateSchema = z.object({
  newTemplateId: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
});
export type DuplicateJobTemplateInput = z.infer<typeof duplicateJobTemplateSchema>;

/** Body for POST /api/jobs/[id]/save-as-template — the fastest path from an existing production job to a reusable template. */
export const saveJobAsTemplateSchema = z.object({
  templateId: z.string().uuid(),
  name: z.string().trim().min(1, 'Template name is required').max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  defaultBusiness: businessSchema,
  plateIds: z.array(z.string().uuid()).min(1, 'Select at least one plate to save'),
});
export type SaveJobAsTemplateInput = z.infer<typeof saveJobAsTemplateSchema>;

/** One plate row of "Create Job from Template"'s preview/edit step. `screenshotPath` is present only when the user picked a replacement image — omitted means "copy the template plate's screenshot". */
const createJobFromTemplatePlateSchema = z.object({
  templatePlateId: z.string().uuid(),
  plateName: z.string().trim().min(1, 'Plate name is required').max(120),
  colors: z.string().trim().max(300).nullable().optional(),
  estimatedDurationSeconds: z.number().int().positive().max(60 * 60 * 24 * 7).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  screenshotPath: z.string().trim().min(1).optional(),
});

/** Body for POST /api/templates/[id]/jobs — "Create Job from Template", the whole point of the feature. */
export const createJobFromTemplateSchema = z.object({
  jobId: z.string().uuid(),
  customerName: z.string().trim().min(1, 'Customer name is required').max(120),
  business: businessSchema,
  notes: z.string().trim().max(1000).nullable().optional(),
  plates: z.array(createJobFromTemplatePlateSchema).min(1, 'At least one plate is required').max(MAX_PLATES_PER_JOB),
});
export type CreateJobFromTemplateInput = z.infer<typeof createJobFromTemplateSchema>;
