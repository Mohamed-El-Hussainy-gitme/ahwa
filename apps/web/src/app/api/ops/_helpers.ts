import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getCookieValue, RUNTIME_SESSION_COOKIE } from '@/lib/auth/cookies';
import { decodeRuntimeSession, assertBoundRuntimeSession } from '@/lib/runtime/session';
import { validatePlatformSupportRuntimeAccess } from '@/lib/runtime/support';
import { adminOps } from '@/app/api/ops/_server';
import { publishOpsEvent } from '@/lib/ops/events';
import { scheduleOpsOutboxDispatch } from '@/lib/ops/outbox/dispatcher';
import { resolveMessage } from '@/lib/messages/catalog';
import { supabaseAdminForDatabase } from '@/lib/supabase/admin';
import type { StationCode } from '@/lib/ops/types';

export type OpsShiftRole = 'supervisor' | 'waiter' | 'american_waiter' | 'barista' | 'shisha';
export type OpsStationCode = 'barista' | 'shisha';
export type OpsOwnerLabel = 'owner' | 'partner' | 'branch_manager' | null;

export type OpsActorContext = {
  cafeId: string;
  tenantSlug: string;
  databaseKey: string;
  runtimeUserId: string;
  fullName: string;
  accountKind: 'owner' | 'employee';
  ownerLabel: OpsOwnerLabel;
  shiftId: string | null;
  shiftRole: OpsShiftRole | null;
  actorOwnerId: string | null;
  actorStaffId: string | null;
};

export type OwnerOpsActorContext = OpsActorContext & {
  accountKind: 'owner';
  actorOwnerId: string;
};

type IdempotencyRow = {
  request_hash?: string | null;
  status?: string | null;
  response_status?: number | null;
  response_body?: unknown;
};

export type BegunIdempotentMutation = {
  key: string;
  actionName: string;
  requestHash: string;
};

export async function requireOpsActorContext(): Promise<OpsActorContext> {
  const token = await getCookieValue(RUNTIME_SESSION_COOKIE);
  const decoded = decodeRuntimeSession(token);
  if (!decoded) {
    throw new Error('UNAUTHORIZED');
  }

  const session = assertBoundRuntimeSession(decoded, 'requireOpsActorContext');
  await validatePlatformSupportRuntimeAccess(session);
  const cafeId = String(session.tenantId ?? '');
  const tenantSlug = String(session.tenantSlug ?? '').trim();
  const databaseKey = String(session.databaseKey ?? '').trim();
  const runtimeUserId = String(session.userId ?? '');
  const fullName = String(session.fullName ?? '').trim();
  const accountKind: 'owner' | 'employee' = session.accountKind === 'owner' ? 'owner' : 'employee';
  const ownerLabel: OpsOwnerLabel =
    session.ownerLabel === 'partner'
      ? 'partner'
      : session.ownerLabel === 'branch_manager'
        ? 'branch_manager'
        : session.ownerLabel === 'owner'
          ? 'owner'
          : null;
  const shiftId = session.shiftId ? String(session.shiftId) : null;
  const shiftRole = session.shiftRole ? (String(session.shiftRole) as OpsShiftRole) : null;
  const actorOwnerId = session.actorOwnerId ? String(session.actorOwnerId) : null;
  const actorStaffId = session.actorStaffId ? String(session.actorStaffId) : null;

  if (!cafeId || !tenantSlug || !databaseKey || !runtimeUserId || !fullName) {
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
    tenantSlug,
    databaseKey,
    runtimeUserId,
    fullName,
    accountKind,
    ownerLabel,
    shiftId,
    shiftRole,
    actorOwnerId,
    actorStaffId,
  } satisfies OpsActorContext;
}

function isOwner(ctx: OpsActorContext): ctx is OwnerOpsActorContext {
  return ctx.accountKind === 'owner' && !!ctx.actorOwnerId;
}

export function isBranchManager(ctx: OpsActorContext): boolean {
  return isOwner(ctx) && ctx.ownerLabel === 'branch_manager';
}

export function isFullOwner(ctx: OpsActorContext): ctx is OwnerOpsActorContext {
  return isOwner(ctx) && ctx.ownerLabel !== 'branch_manager';
}

function hasAnyShiftRole(ctx: OpsActorContext, roles: OpsShiftRole[]) {
  if (!ctx.shiftRole) return false;
  if (ctx.shiftRole === 'american_waiter') {
    return roles.some((role) => role === 'waiter' || role === 'barista' || role === 'shisha' || role === 'supervisor' || role === 'american_waiter');
  }
  return roles.includes(ctx.shiftRole);
}

function requireRoleAccess(ctx: OpsActorContext, allowedShiftRoles: OpsShiftRole[] = []) {
  if (isOwner(ctx) || hasAnyShiftRole(ctx, allowedShiftRoles)) {
    return ctx;
  }
  throw new Error('FORBIDDEN');
}

export function requireOwnerRole(ctx: OpsActorContext): OwnerOpsActorContext {
  if (isOwner(ctx)) return ctx;
  throw new Error('FORBIDDEN');
}

export function requireFullOwnerRole(ctx: OpsActorContext): OwnerOpsActorContext {
  if (isFullOwner(ctx)) return ctx;
  throw new Error('FORBIDDEN');
}

export function requireManagementAccess(ctx: OpsActorContext) {
  if (isOwner(ctx)) return ctx;
  throw new Error('FORBIDDEN');
}

export function requireOwnerOrSupervisor(ctx: OpsActorContext) {
  return requireRoleAccess(ctx, ['supervisor', 'american_waiter']);
}

export function requireBillingAccess(ctx: OpsActorContext) {
  return requireRoleAccess(ctx, ['supervisor', 'american_waiter']);
}

export function requireDeferredAccess(ctx: OpsActorContext) {
  return requireRoleAccess(ctx, ['supervisor', 'american_waiter']);
}

export function requireReportsAccess(ctx: OpsActorContext) {
  return requireRoleAccess(ctx, ['supervisor', 'american_waiter']);
}

export function requireComplaintLogAccess(ctx: OpsActorContext) {
  return requireRoleAccess(ctx, ['supervisor', 'waiter', 'american_waiter', 'shisha']);
}

export function requireComplaintManagementAccess(ctx: OpsActorContext) {
  return requireRoleAccess(ctx, ['supervisor', 'american_waiter']);
}

export function requireComplaintActionAccess(
  ctx: OpsActorContext,
  _stationCode?: StationCode | null | undefined,
) {
  return requireComplaintManagementAccess(ctx);
}

export function requireWaiterWorkspaceAccess(ctx: OpsActorContext) {
  return requireRoleAccess(ctx, ['supervisor', 'waiter', 'american_waiter', 'shisha']);
}

export function requireSessionOrderAccess(ctx: OpsActorContext) {
  return requireRoleAccess(ctx, ['supervisor', 'waiter', 'american_waiter', 'shisha']);
}

export function requireDeliveryAccess(ctx: OpsActorContext) {
  return requireRoleAccess(ctx, ['supervisor', 'waiter', 'american_waiter', 'shisha']);
}

function isAllowedStationCode(stationCode: StationCode | null | undefined, allowed: readonly StationCode[]) {
  return !!stationCode && allowed.includes(stationCode);
}

export function requireScopedOrderItemAccess(
  ctx: OpsActorContext,
  stationCode: StationCode | null | undefined,
  allowed: readonly StationCode[],
) {
  if (isOwner(ctx) || ctx.shiftRole === 'supervisor' || ctx.shiftRole === 'american_waiter') {
    return ctx;
  }

  if (ctx.shiftRole === 'waiter') {
    return ctx;
  }

  if (ctx.shiftRole === 'shisha' && isAllowedStationCode(stationCode, allowed)) {
    return ctx;
  }

  throw new Error('FORBIDDEN');
}

export function requireScopedOrderSelectionAccess(
  ctx: OpsActorContext,
  stationCodes: readonly StationCode[],
) {
  requireSessionOrderAccess(ctx);

  if (isOwner(ctx) || ctx.shiftRole === 'supervisor' || ctx.shiftRole === 'waiter' || ctx.shiftRole === 'american_waiter') {
    return ctx;
  }

  if (ctx.shiftRole === 'shisha' && stationCodes.every((stationCode) => stationCode === 'shisha')) {
    return ctx;
  }

  throw new Error('FORBIDDEN');
}

export function requireDeliveryItemAccess(ctx: OpsActorContext, stationCode: StationCode | null | undefined) {
  requireRoleAccess(ctx, ['supervisor', 'waiter', 'american_waiter', 'shisha']);

  if (isOwner(ctx) || ctx.shiftRole === 'supervisor' || ctx.shiftRole === 'american_waiter') {
    return ctx;
  }

  if (ctx.shiftRole === 'waiter' && stationCode && stationCode !== 'shisha') {
    return ctx;
  }

  if (ctx.shiftRole === 'shisha' && stationCode === 'shisha') {
    return ctx;
  }

  throw new Error('FORBIDDEN');
}

export async function withIdempotentMutation<T>(
  ctx: OpsActorContext,
  params: {
    scope: string;
    actionName: string;
    requestBody: unknown;
    execute: (helpers: { idempotencyKey: string }) => Promise<T>;
  },
): Promise<T> {
  const client = supabaseAdminForDatabase(ctx.databaseKey);
  const bodyText = JSON.stringify(params.requestBody ?? {});
  const requestHash = crypto.createHash('sha256').update(bodyText).digest('hex');
  const idempotencyKey = crypto
    .createHash('sha256')
    .update([ctx.cafeId, ctx.runtimeUserId, params.scope, requestHash].join(':'))
    .digest('hex');

  const { data: existingRow, error: existingError } = await client
    .schema('ops')
    .from('idempotency_keys')
    .select('request_hash, status, response_status, response_body')
    .eq('cafe_id', ctx.cafeId)
    .eq('key', idempotencyKey)
    .maybeSingle<IdempotencyRow>();

  if (existingError) {
    throw existingError;
  }

  if (existingRow?.request_hash && existingRow.request_hash !== requestHash) {
    throw new Error('IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD');
  }

  if (existingRow?.status === 'completed') {
    return existingRow.response_body as T;
  }

  const { error: upsertError } = await client.rpc('ops_begin_idempotent_mutation', {
    p_cafe_id: ctx.cafeId,
    p_key: idempotencyKey,
    p_action_name: params.actionName,
    p_request_hash: requestHash,
    p_actor_owner_id: ctx.actorOwnerId,
    p_actor_staff_id: ctx.actorStaffId,
  });

  if (upsertError) {
    throw upsertError;
  }

  try {
    const result = await params.execute({ idempotencyKey });

    const responseBody = result === undefined ? null : result;
    const { error: finishError } = await client.rpc('ops_finish_idempotent_mutation', {
      p_cafe_id: ctx.cafeId,
      p_key: idempotencyKey,
      p_response_status: 200,
      p_response_body: responseBody,
    });

    if (finishError) {
      throw finishError;
    }

    return result;
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : 'REQUEST_FAILED';
    const { error: failError } = await client.rpc('ops_fail_idempotent_mutation', {
      p_cafe_id: ctx.cafeId,
      p_key: idempotencyKey,
      p_response_status: 400,
      p_response_body: { ok: false, error: errorCode },
    });

    if (failError) {
      console.error('[ops:idempotency] failed to persist failure response', failError);
    }

    throw error;
  }
}

export function opsErrorResponse(error: unknown, fallbackCode = 'REQUEST_FAILED', status = 400) {
  const code = error instanceof Error ? error.message : fallbackCode;
  return NextResponse.json({ ok: false, error: resolveMessage(code) ?? code }, { status });
}

export async function publishWorkspaceInvalidation(input: {
  ctx: OpsActorContext;
  type: string;
  scopes: string[];
  entityId?: string | null;
  payload?: Record<string, unknown>;
}) {
  await publishOpsEvent({
    cafeId: input.ctx.cafeId,
    type: input.type,
    scopes: input.scopes,
    entityId: input.entityId ?? null,
    actor: {
      actorType: input.ctx.accountKind === 'owner' ? 'owner' : 'staff',
      actorId: input.ctx.accountKind === 'owner' ? input.ctx.actorOwnerId : input.ctx.actorStaffId,
      actorLabel:
        input.ctx.accountKind === 'owner'
          ? input.ctx.ownerLabel ?? 'owner'
          : input.ctx.shiftRole ?? 'staff',
    },
    payload: input.payload ?? {},
  });

  await scheduleOpsOutboxDispatch({ databaseKey: input.ctx.databaseKey });
}

export { adminOps };
