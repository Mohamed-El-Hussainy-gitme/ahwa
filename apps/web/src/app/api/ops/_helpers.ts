import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getCookieValue, RUNTIME_SESSION_COOKIE } from '@/lib/auth/cookies';
import { decodeRuntimeSession, assertBoundRuntimeSession } from '@/lib/runtime/session';
import { adminOps } from '@/app/api/ops/_server';
import { publishOpsEvent } from '@/lib/ops/events';
import { resolveMessage } from '@/lib/messages/catalog';
import type { StationCode } from '@/lib/ops/types';

export type OpsShiftRole = 'supervisor' | 'waiter' | 'barista' | 'shisha';
export type OpsStationCode = 'barista' | 'shisha';

export type OpsActorContext = {
  cafeId: string;
  tenantSlug: string;
  databaseKey: string;
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
  const cafeId = String(session.tenantId ?? '');
  const tenantSlug = String(session.tenantSlug ?? '').trim();
  const databaseKey = String(session.databaseKey ?? '').trim();
  const runtimeUserId = String(session.userId ?? '');
  const fullName = String(session.fullName ?? '').trim();
  const accountKind: 'owner' | 'employee' = session.accountKind === 'owner' ? 'owner' : 'employee';
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

  const context = {
    cafeId,
    tenantSlug,
    databaseKey,
    runtimeUserId,
    fullName,
    accountKind,
    shiftId,
    shiftRole,
    actorOwnerId,
    actorStaffId,
  } satisfies OpsActorContext;

  return context;
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

export function requireComplaintLogAccess(ctx: OpsActorContext) {
  return requireRoleAccess(ctx, ['supervisor', 'waiter', 'shisha']);
}

export function requireComplaintManagementAccess(ctx: OpsActorContext) {
  return requireRoleAccess(ctx, ['supervisor']);
}

export function requireComplaintActionAccess(
  ctx: OpsActorContext,
  _stationCode?: StationCode | null | undefined,
) {
  return requireComplaintManagementAccess(ctx);
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

function isAllowedStationCode(stationCode: StationCode | null | undefined, allowed: readonly StationCode[]) {
  return !!stationCode && allowed.includes(stationCode);
}

export function requireScopedOrderItemAccess(
  ctx: OpsActorContext,
  stationCode: StationCode | null | undefined,
  allowed: readonly StationCode[],
) {
  if (isOwner(ctx) || ctx.shiftRole === 'supervisor') {
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

  if (isOwner(ctx) || ctx.shiftRole === 'supervisor' || ctx.shiftRole === 'waiter') {
    return ctx;
  }

  if (ctx.shiftRole === 'shisha' && stationCodes.every((stationCode) => stationCode === 'shisha')) {
    return ctx;
  }

  throw new Error('FORBIDDEN');
}

export function requireDeliveryItemAccess(ctx: OpsActorContext, stationCode: StationCode | null | undefined) {
  requireRoleAccess(ctx, ['supervisor', 'waiter', 'shisha']);

  if (isOwner(ctx) || ctx.shiftRole === 'supervisor') {
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

export function requireComplaintItemAccess(
  ctx: OpsActorContext,
  stationCode: StationCode | null | undefined,
  action: 'none' | 'remake' | 'cancel_undelivered' | 'waive_delivered',
) {
  if (action === 'none') {
    requireComplaintLogAccess(ctx);

    if (isOwner(ctx) || ctx.shiftRole === 'supervisor' || ctx.shiftRole === 'waiter') {
      return ctx;
    }

    if (ctx.shiftRole === 'shisha' && stationCode === 'shisha') {
      return ctx;
    }

    throw new Error('FORBIDDEN');
  }

  return requireComplaintActionAccess(ctx, stationCode);
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

export async function requireOpenOpsShift(cafeId: string, databaseKey: string) {
  const admin = adminOps(databaseKey);
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

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value);
  }

  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

function readIdempotencyKey(request: Request) {
  const key = request.headers.get('x-ahwa-idempotency-key');
  return key ? key.trim().slice(0, 180) : '';
}

export async function beginIdempotentMutation(
  request: Request,
  ctx: Pick<OpsActorContext, 'cafeId' | 'databaseKey' | 'runtimeUserId' | 'actorOwnerId' | 'actorStaffId'>,
  actionName: string,
  payload: unknown,
): Promise<{ replayResponse: NextResponse | null; mutation: BegunIdempotentMutation | null }> {
  const key = readIdempotencyKey(request);
  if (!key) {
    return { replayResponse: null, mutation: null };
  }

  const requestHash = crypto
    .createHash('sha256')
    .update(`${actionName}|${stableStringify(payload)}`)
    .digest('hex');

  const admin = adminOps(ctx.databaseKey);
  const insertPayload = {
    cafe_id: ctx.cafeId,
    idempotency_key: key,
    action_name: actionName,
    request_hash: requestHash,
    actor_runtime_user_id: ctx.runtimeUserId,
    actor_owner_id: ctx.actorOwnerId,
    actor_staff_id: ctx.actorStaffId,
  };

  const { error: insertError } = await admin.from('idempotency_keys').insert(insertPayload);
  if (!insertError) {
    return {
      replayResponse: null,
      mutation: { key, actionName, requestHash },
    };
  }

  if ((insertError as { code?: string } | null)?.code != '23505') {
    throw insertError;
  }

  const { data, error } = await admin
    .from('idempotency_keys')
    .select('request_hash, status, response_status, response_body')
    .eq('cafe_id', ctx.cafeId)
    .eq('idempotency_key', key)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = (data ?? null) as IdempotencyRow | null;
  if (!row) {
    throw new Error('IDEMPOTENCY_RETRY_REQUIRED');
  }

  if (String(row.request_hash ?? '') !== requestHash) {
    throw new Error('IDEMPOTENCY_KEY_PAYLOAD_MISMATCH');
  }

  if (String(row.status ?? '') === 'completed' && row.response_body && typeof row.response_body === 'object') {
    return {
      replayResponse: NextResponse.json(row.response_body as Record<string, unknown>, {
        status: Number(row.response_status ?? 200),
      }),
      mutation: null,
    };
  }

  throw new Error('IDEMPOTENT_REQUEST_IN_PROGRESS');
}

export async function completeIdempotentMutation(
  ctx: Pick<OpsActorContext, 'cafeId' | 'databaseKey'>,
  mutation: BegunIdempotentMutation | null,
  responseBody: Record<string, unknown>,
  responseStatus = 200,
) {
  if (!mutation) {
    return;
  }

  const admin = adminOps(ctx.databaseKey);
  const { error } = await admin
    .from('idempotency_keys')
    .update({
      status: 'completed',
      response_status: responseStatus,
      response_body: responseBody,
      completed_at: new Date().toISOString(),
    })
    .eq('cafe_id', ctx.cafeId)
    .eq('idempotency_key', mutation.key)
    .eq('request_hash', mutation.requestHash);

  if (error) {
    throw error;
  }
}

export async function releaseIdempotentMutation(
  ctx: Pick<OpsActorContext, 'cafeId' | 'databaseKey'>,
  mutation: BegunIdempotentMutation | null,
) {
  if (!mutation) {
    return;
  }

  const admin = adminOps(ctx.databaseKey);
  const { error } = await admin
    .from('idempotency_keys')
    .delete()
    .eq('cafe_id', ctx.cafeId)
    .eq('idempotency_key', mutation.key)
    .eq('request_hash', mutation.requestHash)
    .eq('status', 'pending');

  if (error) {
    throw error;
  }
}

export function jsonError(error: unknown, status = 400) {
  const message = resolveMessage(error instanceof Error ? error.message : 'REQUEST_FAILED');
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
