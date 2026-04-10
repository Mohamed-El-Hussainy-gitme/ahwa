import { createHmac, timingSafeEqual } from 'crypto';

export const RUNTIME_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export type RuntimeShiftRole = 'supervisor' | 'waiter' | 'barista' | 'shisha' | 'american_waiter';
export type RuntimeAccountKind = 'owner' | 'employee';
export type RuntimeSessionVersion = 1 | 2;

export type RuntimeSupportAccessPayload = {
  mode: 'platform_support';
  superAdminUserId: string;
  messageId: string;
  grantId: string;
  expiresAt?: string | null;
};

export type RuntimeSessionPayload = {
  sessionVersion: RuntimeSessionVersion;
  databaseKey: string | null;
  tenantId: string;
  tenantSlug: string;
  userId: string;
  fullName: string;
  accountKind: RuntimeAccountKind;
  ownerLabel?: 'owner' | 'partner' | 'branch_manager';
  shiftId?: string | null;
  shiftRole?: RuntimeShiftRole | null;
  actorOwnerId?: string | null;
  actorStaffId?: string | null;
  supportAccess?: RuntimeSupportAccessPayload | null;
};

export type BoundRuntimeSessionPayload = RuntimeSessionPayload & {
  sessionVersion: 2;
  databaseKey: string;
};

function getSecret(): string {
  const secret = process.env.AHWA_SESSION_SECRET;
  if (!secret) throw new Error('AHWA_SESSION_SECRET is missing');
  return secret;
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload, 'utf8').digest('base64url');
}

function normalizeDatabaseKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

export function isBoundRuntimeSession(session: RuntimeSessionPayload | null | undefined): session is BoundRuntimeSessionPayload {
  return !!session && session.sessionVersion === 2 && typeof session.databaseKey === 'string' && session.databaseKey.trim().length > 0;
}

export function assertBoundRuntimeSession(
  session: RuntimeSessionPayload | null | undefined,
  where = 'assertBoundRuntimeSession',
): BoundRuntimeSessionPayload {
  if (!isBoundRuntimeSession(session)) {
    throw new Error(`[${where}] UNBOUND_RUNTIME_SESSION`);
  }

  return session;
}

export function encodeRuntimeSession(session: RuntimeSessionPayload): string {
  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function decodeRuntimeSession(raw: string | null | undefined): RuntimeSessionPayload | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = sign(payload);
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<RuntimeSessionPayload>;
    if (!parsed || typeof parsed.tenantId !== 'string' || typeof parsed.tenantSlug !== 'string' || typeof parsed.userId !== 'string' || typeof parsed.fullName !== 'string') {
      return null;
    }
    if (parsed.accountKind !== 'owner' && parsed.accountKind !== 'employee') {
      return null;
    }

    const databaseKey = normalizeDatabaseKey(parsed.databaseKey);
    const sessionVersion: RuntimeSessionVersion = parsed.sessionVersion === 2 && databaseKey ? 2 : 1;

    return {
      sessionVersion,
      databaseKey,
      tenantId: parsed.tenantId,
      tenantSlug: parsed.tenantSlug,
      userId: parsed.userId,
      fullName: parsed.fullName,
      accountKind: parsed.accountKind,
      ownerLabel: parsed.ownerLabel === 'partner' ? 'partner' : parsed.ownerLabel === 'branch_manager' ? 'branch_manager' : parsed.ownerLabel === 'owner' ? 'owner' : undefined,
      shiftId: typeof parsed.shiftId === 'string' ? parsed.shiftId : null,
      shiftRole:
        parsed.shiftRole === 'supervisor' ||
        parsed.shiftRole === 'waiter' ||
        parsed.shiftRole === 'barista' ||
        parsed.shiftRole === 'shisha' ||
        parsed.shiftRole === 'american_waiter'
          ? parsed.shiftRole
          : null,
      actorOwnerId: typeof parsed.actorOwnerId === 'string' ? parsed.actorOwnerId : null,
      actorStaffId: typeof parsed.actorStaffId === 'string' ? parsed.actorStaffId : null,
      supportAccess:
        parsed.supportAccess &&
        typeof parsed.supportAccess === 'object' &&
        parsed.supportAccess !== null &&
        parsed.supportAccess.mode === 'platform_support' &&
        typeof parsed.supportAccess.superAdminUserId === 'string' &&
        typeof parsed.supportAccess.messageId === 'string' &&
        typeof parsed.supportAccess.grantId === 'string'
          ? {
              mode: 'platform_support',
              superAdminUserId: parsed.supportAccess.superAdminUserId,
              messageId: parsed.supportAccess.messageId,
              grantId: parsed.supportAccess.grantId,
              expiresAt: typeof parsed.supportAccess.expiresAt === 'string' ? parsed.supportAccess.expiresAt : null,
            }
          : null,
    };
  } catch {
    return null;
  }
}
