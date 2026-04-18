import { z } from 'zod';

export const ShiftChecklistStageSchema = z.enum(['opening', 'closing']);
export const ShiftChecklistStatusSchema = z.enum(['draft', 'completed']);

export const ShiftChecklistFlagsSchema = z.object({
  cashVerified: z.boolean().default(false),
  criticalInventoryReady: z.boolean().default(false),
  machineReady: z.boolean().default(false),
  grinderReady: z.boolean().default(false),
  shishaReady: z.boolean().default(false),
  cleanlinessReady: z.boolean().default(false),
  previousShiftIssuesReviewed: z.boolean().default(false),
  supervisorApproved: z.boolean().default(false),
  supervisorSignoffName: z.string().trim().max(120).nullable().default(null),
});

export const ShiftChecklistPayloadSchema = z.object({
  checklist: ShiftChecklistFlagsSchema.default({
    cashVerified: false,
    criticalInventoryReady: false,
    machineReady: false,
    grinderReady: false,
    shishaReady: false,
    cleanlinessReady: false,
    previousShiftIssuesReviewed: false,
    supervisorApproved: false,
    supervisorSignoffName: null,
  }),
  quickCashCount: z.coerce.number().finite().min(0).max(100000000).nullable().optional(),
  supervisorNotes: z.string().trim().max(1200).nullable().optional(),
  issuesSummary: z.string().trim().max(1200).nullable().optional(),
  status: ShiftChecklistStatusSchema.optional(),
});

export const ShiftChecklistUpsertInputSchema = z.object({
  shiftId: z.string().uuid(),
  stage: ShiftChecklistStageSchema,
  payload: ShiftChecklistPayloadSchema,
});

export type ShiftChecklistStage = z.infer<typeof ShiftChecklistStageSchema>;
export type ShiftChecklistStatus = z.infer<typeof ShiftChecklistStatusSchema>;
export type ShiftChecklistFlags = z.infer<typeof ShiftChecklistFlagsSchema>;
export type ShiftChecklistPayload = z.infer<typeof ShiftChecklistPayloadSchema>;
