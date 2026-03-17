import type { ShiftRole } from "../domain/contract-v2.js";

export type PlatformRole = "super_admin";
export type CafeAccountRole = "owner" | "partner" | "employee";

export interface TenantContext {
  readonly tenantId: string;
  readonly branchId: string;
  readonly tenantSlug: string;
}

export interface BoundTenantContext extends TenantContext {
  readonly databaseKey: string;
}

export interface OperationalDatabaseBinding {
  readonly cafeId: string;
  readonly databaseKey: string;
  readonly bindingSource: 'manual' | 'migration' | 'legacy' | 'unknown';
}

export interface DeviceGateContext extends TenantContext {
  readonly deviceId: string;
  readonly deviceMode: "shared_runtime" | "station_only" | "owner_private";
}

export interface AuthenticatedRuntimeUser {
  readonly userId: string;
  readonly fullName: string;
  readonly accountRole: CafeAccountRole;
  readonly shiftRole?: ShiftRole;
}
