import {
  ShiftChecklistFlagsSchema,
  ShiftChecklistPayloadSchema,
  type ShiftChecklistFlags,
  type ShiftChecklistPayload,
  type ShiftChecklistStage,
  type ShiftChecklistStatus,
} from '@/lib/ops/shift-checklists-schema';
import type { ShiftChecklistRecord, ShiftChecklistSummary } from '@/lib/ops/types';

export function emptyShiftChecklistFlags(): ShiftChecklistFlags {
  return ShiftChecklistFlagsSchema.parse({});
}

export function defaultShiftChecklistPayload(status: ShiftChecklistStatus = 'draft'): ShiftChecklistPayload {
  return ShiftChecklistPayloadSchema.parse({ status, checklist: emptyShiftChecklistFlags() });
}

export function normalizeShiftChecklistPayload(input: unknown, fallbackStatus: ShiftChecklistStatus = 'draft'): ShiftChecklistPayload {
  const parsed = ShiftChecklistPayloadSchema.parse(input ?? {});
  return {
    ...parsed,
    checklist: ShiftChecklistFlagsSchema.parse(parsed.checklist ?? {}),
    quickCashCount: parsed.quickCashCount ?? null,
    supervisorNotes: parsed.supervisorNotes ?? null,
    issuesSummary: parsed.issuesSummary ?? null,
    status: parsed.status ?? fallbackStatus,
  };
}

export function summarizeShiftChecklist(record: ShiftChecklistRecord): ShiftChecklistSummary {
  const checklist = ShiftChecklistFlagsSchema.parse(record.checklist ?? {});
  const checkedCount = Object.entries(checklist).reduce((count, [key, value]) => {
    if (key === 'supervisorSignoffName') return count;
    return count + (value ? 1 : 0);
  }, 0);

  return {
    stage: record.stage,
    status: record.status,
    checkedCount,
    supervisorApproved: !!checklist.supervisorApproved,
    supervisorSignoffName: checklist.supervisorSignoffName ?? null,
    quickCashCount: record.quickCashCount,
    supervisorNotes: record.supervisorNotes,
    issuesSummary: record.issuesSummary,
    approvedAt: record.approvedAt,
    updatedAt: record.updatedAt,
  };
}

export function mergeChecklistSummariesByStage(records: ShiftChecklistRecord[]): ShiftChecklistSummary[] {
  const stageOrder: ShiftChecklistStage[] = ['opening', 'closing'];
  const byStage = new Map<ShiftChecklistStage, ShiftChecklistSummary>();
  for (const record of records) {
    byStage.set(record.stage, summarizeShiftChecklist(record));
  }
  return stageOrder.map((stage) => byStage.get(stage)).filter(Boolean) as ShiftChecklistSummary[];
}
