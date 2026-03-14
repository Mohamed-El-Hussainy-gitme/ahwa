import { NextResponse } from 'next/server';
import { getEnrichedRuntimeMeFromCookie } from '@/lib/runtime/me';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { publishOpsEvent } from '@/lib/ops/events';

export type OpsShiftRole = 'supervisor' | 'waiter' | 'barista' | 'shisha';
export type OpsStationCode = 'barista' | 'shisha';

export type OpsActorContext = {
  cafeId: string;
  runtimeUserId: string;
  fullName: string;
  accountKind: 'owner' | 'employee';
  shiftId: string | null;
  shiftRole: OpsShiftRole | null;
  actorOwnerId: string | null;
  actorStaffId: string | null;
};

export type OwnerOpsActorContext = OpsActorContext & {
  accountKind: 'owner';
  actorOwnerId: string;
};

export async function requireOpsActorContext(): Promise<OpsActorContext> {
  const me = await getEnrichedRuntimeMeFromCookie();
  if (!me) {
    throw new Error('UNAUTHORIZED');
  }

  const cafeId = String(me.tenantId ?? '');
  const runtimeUserId = String(me.userId ?? '');
  const fullName = String(me.fullName ?? '').trim();
  const accountKind: 'owner' | 'employee' = me.accountKind === 'owner' ? 'owner' : 'employee';
  const shiftId = me.shiftId ? String(me.shiftId) : null;
  const shiftRole = me.shiftRole ? (String(me.shiftRole) as OpsShiftRole) : null;
  const actorOwnerId = me.actorOwnerId ? String(me.actorOwnerId) : null;
  const actorStaffId = me.actorStaffId ? String(me.actorStaffId) : null;

  if (!cafeId || !runtimeUserId || !fullName) {
    throw new Error('INVALID_RUNTIME_CONTEXT');
  }

  if (accountKind === 'owner' && !actorOwnerId) {
    throw new Error('OWNER_ACTOR_NOT_BOUND');
  }

  if (accountKind === 'employee' && !actorStaffId) {
    throw new Error('STAFF_ACTOR_NOT_BOUND');
  }

  return {
    cafeId,
    runtimeUserId,
    fullName,
    accountKind,
    shiftId,
    shiftRole,
    actorOwnerId,
    actorStaffId,
  };
}

function isOwner(ctx: OpsActorContext): ctx is OwnerOpsActorContext {
  return ctx.accountKind === 'owner' && !!ctx.actorOwnerId;
}

function hasAnyShiftRole(ctx: OpsActorContext, roles: OpsShiftRole[]) {
  return !!ctx.shiftRole && roles.includes(ctx.shiftRole);
}

function requireRoleAccess(ctx: OpsActorContext, allowedShiftRoles: OpsShiftRole[] = []) {
  if (isOwner(ctx) || hasAnyShiftRole(ctx, allowedShiftRoles)) {
    return ctx;
  }

  throw new Error('FORBIDDEN');
}

export function requireOwnerRole(ctx: OpsActorContext): OwnerOpsActorContext {
  if (isOwner(ctx)) {
    return ctx;
  }

  throw new Error('FORBIDDEN');
}

export function requireOwnerOrSupervisor(ctx: OpsActorContext) {
  return requireRoleAccess(ctx, ['supervisor']);
}

export function requireBillingAccess(ctx: OpsActorContext) {
  return requireRoleAccess(ctx, ['supervisor']);
}

export function requireDeferredAccess(ctx: OpsActorContext) {
  return requireRoleAccess(ctx, ['supervisor']);
}

export function requireReportsAccess(ctx: OpsActorContext) {
  return requireRoleAccess(ctx, ['supervisor']);
}

export function requireComplaintsAccess(ctx: OpsActorContext) {
  return requireRoleAccess(ctx, ['supervisor', 'waiter', 'shisha']);
}

export function requireWaiterWorkspaceAccess(ctx: OpsActorContext) {
  return requireRoleAccess(ctx, ['supervisor', 'waiter', 'shisha']);
}

export function requireSessionOrderAccess(ctx: OpsActorContext) {
  return requireRoleAccess(ctx, ['supervisor', 'waiter', 'shisha']);
}

export function requireDeliveryAccess(ctx: OpsActorContext) {
  return requireRoleAccess(ctx, ['supervisor', 'waiter', 'shisha']);
}

export function requireStationAccess(ctx: OpsActorContext, stationCode: OpsStationCode) {
  if (isOwner(ctx) || ctx.shiftRole === 'supervisor') {
    return ctx;
  }

  if (stationCode === 'barista' && ctx.shiftRole === 'barista') {
    return ctx;
  }

  if (stationCode === 'shisha' && ctx.shiftRole === 'shisha') {
    return ctx;
  }

  throw new Error('FORBIDDEN');
}

export async function requireOpenOpsShift(cafeId: string) {
  const admin = supabaseAdmin().schema('ops');
  const { data, error } = await admin
    .from('shifts')
    .select('id, shift_kind, status, opened_at')
    .eq('cafe_id', cafeId)
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('NO_OPEN_SHIFT');
  }

  return data;
}

export function jsonError(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : 'REQUEST_FAILED';
  return NextResponse.json({ error: message }, { status });
}

export function ok(data: unknown) {
  return NextResponse.json(data, { status: 200 });
}

export function publishOpsMutation(
  ctx: Pick<OpsActorContext, 'cafeId' | 'shiftId'>,
  input: {
    type: string;
    entityId?: string | null;
    shiftId?: string | null;
    data?: Record<string, unknown>;
  },
) {
  return publishOpsEvent({
    type: input.type,
    cafeId: ctx.cafeId,
    shiftId: input.shiftId ?? ctx.shiftId ?? null,
    entityId: input.entityId ?? null,
    data: input.data,
  });
}
