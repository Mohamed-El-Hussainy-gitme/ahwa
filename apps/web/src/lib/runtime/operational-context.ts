import { assertBoundRuntimeSession, type BoundRuntimeSessionPayload } from '@/lib/runtime/session';

export type OperationalRequestContext = {
  cafeId: string;
  tenantSlug: string;
  databaseKey: string;
  runtimeUserId: string;
  actorUserId: string;
  accountKind: 'owner' | 'employee';
  actorOwnerId: string | null;
  actorStaffId: string | null;
  shiftId: string | null;
  shiftRole: 'supervisor' | 'waiter' | 'barista' | 'shisha' | null;
};

export function toOperationalRequestContext(session: BoundRuntimeSessionPayload): OperationalRequestContext {
  return {
    cafeId: session.tenantId,
    tenantSlug: session.tenantSlug,
    databaseKey: session.databaseKey,
    runtimeUserId: session.userId,
    actorUserId: session.accountKind === 'owner' ? session.actorOwnerId ?? session.userId : session.actorStaffId ?? session.userId,
    accountKind: session.accountKind,
    actorOwnerId: session.actorOwnerId ?? null,
    actorStaffId: session.actorStaffId ?? null,
    shiftId: session.shiftId ?? null,
    shiftRole: session.shiftRole ?? null,
  };
}

export function operationalContextFromRuntimeSession(
  session: BoundRuntimeSessionPayload | null | undefined,
  where = 'operationalContextFromRuntimeSession',
): OperationalRequestContext {
  return toOperationalRequestContext(assertBoundRuntimeSession(session, where));
}
