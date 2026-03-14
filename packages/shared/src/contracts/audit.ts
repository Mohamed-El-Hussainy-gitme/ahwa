export interface DomainEventSummary {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId?: string;
  readonly shiftId?: string;
  readonly actorUserId?: string;
  readonly actorFullName?: string;
  readonly deviceId?: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly payload: unknown;
  readonly occurredAt: string;
}

export interface AuditLogSummary {
  readonly id: string;
  readonly tenantId?: string;
  readonly actorUserId?: string;
  readonly actorFullName?: string;
  readonly deviceId?: string;
  readonly entityType: string;
  readonly entityId?: string;
  readonly actionName: string;
  readonly oldData: unknown;
  readonly newData: unknown;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly createdAt: string;
}

export interface SupportAccessLogSummary {
  readonly id: string;
  readonly superAdminUserId?: string;
  readonly superAdminFullName?: string;
  readonly tenantId?: string;
  readonly tenantName?: string;
  readonly branchId?: string;
  readonly branchName?: string;
  readonly accessReason: string;
  readonly createdAt: string;
}

export interface TenantOverviewSummary {
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly tenantName: string;
  readonly branchCount: string;
  readonly activeUserCount: string;
  readonly openShiftCount: string;
  readonly activeDeviceCount: string;
  readonly activeSessionCount: string;
  readonly outstandingDeferredBalance: string;
}
