import { z } from 'zod';

export const amsSlotNumberSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);
export type AmsSlotNumber = z.infer<typeof amsSlotNumberSchema>;

export const amsSlotSchema = z.object({
  slotNumber: amsSlotNumberSchema,
  isUsed: z.boolean(),
  colorName: z.string().trim().min(1).max(60).nullable(),
  materialName: z.string().trim().min(1).max(60).nullable(),
  notes: z.string().trim().max(280).nullable(),
});
export type AmsSlot = z.infer<typeof amsSlotSchema>;

/** Input shape for the "add print" form, before slot numbers are pinned. */
export const amsSlotInputSchema = z
  .object({
    isUsed: z.boolean(),
    colorName: z.string().trim().max(60).nullable().optional(),
    materialName: z.string().trim().max(60).nullable().optional(),
    notes: z.string().trim().max(280).nullable().optional(),
  })
  .superRefine((slot, ctx) => {
    if (slot.isUsed && (!slot.colorName || slot.colorName.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Color is required for a slot marked as used',
        path: ['colorName'],
      });
    }
  });
export type AmsSlotInput = z.infer<typeof amsSlotInputSchema>;

/**
 * Exactly four slots, numbered 1-4, matching the physical AMS unit.
 *
 * Does NOT enforce "at least one slot used" here — that rule depends on the
 * `externalSpoolConfirmed` flag on the parent job-creation form, so it is
 * checked in `createPrintJobSchema` instead.
 */
export const amsSlotSetInputSchema = z.tuple([
  amsSlotInputSchema,
  amsSlotInputSchema,
  amsSlotInputSchema,
  amsSlotInputSchema,
]);
export type AmsSlotSetInput = z.infer<typeof amsSlotSetInputSchema>;
