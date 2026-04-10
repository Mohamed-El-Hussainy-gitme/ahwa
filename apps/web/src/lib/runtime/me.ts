import { getCookieValue, RUNTIME_SESSION_COOKIE } from '@/lib/auth/cookies';
import { decodeRuntimeSession, type RuntimeSessionPayload } from '@/lib/runtime/session';
import {
  getPlatformSupportRuntimeAccess,
  isSupportRuntimeSessionError,
  validatePlatformSupportRuntimeAccess,
} from '@/lib/runtime/support';
import { resolveRuntimeOpsActor, type RuntimeAccountKind, type RuntimeOpsActorIdentity } from '@/lib/runtime/ops-actor';

export const UNBOUND_RUNTIME_SESSION_CODE = 'UNBOUND_RUNTIME_SESSION';

export class UnboundRuntimeSessionError extends Error {
  readonly code = UNBOUND_RUNTIME_SESSION_CODE;

  constructor(message = UNBOUND_RUNTIME_SESSION_CODE) {
    super(message);
    this.name = 'UnboundRuntimeSessionError';
  }
}

export function isUnboundRuntimeSessionError(error: unknown): error is UnboundRuntimeSessionError {
  return (
    error instanceof UnboundRuntimeSessionError ||
    (error instanceof Error && error.message.includes(UNBOUND_RUNTIME_SESSION_CODE))
  );
}

export type RuntimeMe = {
  tenantId: string;
  tenantSlug: string;
  databaseKey?: string;
  userId: string;
  fullName: string;
  accountKind: RuntimeAccountKind;
  ownerLabel?: 'owner' | 'partner' | 'branch_manager';
  shiftId?: string;
  shiftRole?: 'supervisor' | 'waiter' | 'american_waiter' | 'barista' | 'shisha';
  supportAccess?: {
    mode: 'platform_support';
    messageId: string;
    grantId: string;
    expiresAt: string | null;
  } | null;
};

export type EnrichedRuntimeMe = RuntimeMe & RuntimeOpsActorIdentity;

function toRuntimeMe(session: RuntimeSessionPayload): RuntimeMe {
  const supportAccess = getPlatformSupportRuntimeAccess(session);
  return {
    tenantId: session.tenantId,
    tenantSlug: session.tenantSlug,
    databaseKey: session.databaseKey ?? undefined,
    userId: session.userId,
    fullName: session.fullName,
    accountKind: session.accountKind,
    ownerLabel: session.ownerLabel,
    shiftId: session.shiftId ?? undefined,
    shiftRole: session.shiftRole ?? undefined,
    supportAccess: supportAccess
      ? {
          mode: 'platform_support',
          messageId: supportAccess.messageId,
          grantId: supportAccess.grantId,
          expiresAt: supportAccess.expiresAt ?? null,
        }
      : null,
  };
}

export async function getBaseRuntimeMeFromSessionToken(sessionToken: string): Promise<RuntimeMe | null> {
  const decoded = decodeRuntimeSession(sessionToken);
  if (!decoded) return null;
  return toRuntimeMe(decoded);
}

export async function enrichRuntimeMe(me: RuntimeMe, rawSessionToken?: string | null): Promise<EnrichedRuntimeMe> {
  const decoded = rawSessionToken ? decodeRuntimeSession(rawSessionToken) : null;
  if (decoded) {
    const supportAccess = getPlatformSupportRuntimeAccess(decoded);
    if (supportAccess) {
      await validatePlatformSupportRuntimeAccess(decoded);
    }

    if (decoded.actorOwnerId || decoded.actorStaffId) {
      return {
        ...me,
        supportAccess: supportAccess
          ? {
              mode: 'platform_support',
              messageId: supportAccess.messageId,
              grantId: supportAccess.grantId,
              expiresAt: supportAccess.expiresAt ?? null,
            }
          : null,
        actorOwnerId: decoded.actorOwnerId ?? null,
        actorStaffId: decoded.actorStaffId ?? null,
        actorType: decoded.actorOwnerId ? 'owner' : decoded.actorStaffId ? 'staff' : null,
        opsActorId: decoded.actorOwnerId ?? decoded.actorStaffId ?? null,
      };
    }
  }

  const databaseKey = String(me.databaseKey ?? '').trim();
  if (!databaseKey) {
    throw new UnboundRuntimeSessionError();
  }

  const actor = await resolveRuntimeOpsActor({
    cafeId: String(me.tenantId),
    databaseKey,
    runtimeUserId: String(me.userId),
    accountKind: me.accountKind,
  });

  return {
    ...me,
    ...actor,
  };
}

export async function getEnrichedRuntimeMeFromSessionToken(sessionToken: string): Promise<EnrichedRuntimeMe | null> {
  const me = await getBaseRuntimeMeFromSessionToken(sessionToken);
  if (!me) return null;
  return enrichRuntimeMe(me, sessionToken);
}

export async function getBaseRuntimeMeFromCookie(): Promise<RuntimeMe | null> {
  const token = await getCookieValue(RUNTIME_SESSION_COOKIE);
  if (!token) return null;
  return getBaseRuntimeMeFromSessionToken(token);
}

export async function getEnrichedRuntimeMeFromCookie(): Promise<EnrichedRuntimeMe | null> {
  const token = await getCookieValue(RUNTIME_SESSION_COOKIE);
  if (!token) return null;
  return getEnrichedRuntimeMeFromSessionToken(token);
}

export { isSupportRuntimeSessionError };
