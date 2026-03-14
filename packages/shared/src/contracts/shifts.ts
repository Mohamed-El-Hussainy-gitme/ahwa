import type { ShiftKind, ShiftRole } from "../domain/contract-v2.js";

export interface ShiftAssignmentPayload {
  readonly userId: string;
  readonly shiftRole: ShiftRole;
  readonly isPrimary?: boolean;
}

export interface OpenShiftRequest {
  readonly branchId?: string;
  readonly shiftKind?: ShiftKind;
  readonly businessDate?: string;
  readonly notes?: string;
}

export interface ReplaceShiftAssignmentsRequest {
  readonly shiftId: string;
  readonly assignments: readonly ShiftAssignmentPayload[];
}

export interface CloseShiftRequest {
  readonly shiftId?: string;
  readonly branchId?: string;
  readonly notes?: string;
}
