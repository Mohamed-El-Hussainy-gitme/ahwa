import { getCookieValue, RUNTIME_SESSION_COOKIE } from '@/lib/auth/cookies';
import { decodeRuntimeSession, type RuntimeSessionPayload } from '@/lib/runtime/session';
import { resolveRuntimeOpsActor, type RuntimeAccountKind, type RuntimeOpsActorIdentity } from '@/lib/runtime/ops-actor';

export type RuntimeMe = {
  tenantId: string;
  tenantSlug: string;
  userId: string;
  fullName: string;
  accountKind: RuntimeAccountKind;
  ownerLabel?: 'owner' | 'partner';
  shiftId?: string;
  shiftRole?: 'supervisor' | 'waiter' | 'barista' | 'shisha';
};

export type EnrichedRuntimeMe = RuntimeMe & RuntimeOpsActorIdentity;

function toRuntimeMe(session: RuntimeSessionPayload): RuntimeMe {
  return {
    tenantId: session.tenantId,
    tenantSlug: session.tenantSlug,
    userId: session.userId,
    fullName: session.fullName,
    accountKind: session.accountKind,
    ownerLabel: session.ownerLabel,
    shiftId: session.shiftId ?? undefined,
    shiftRole: session.shiftRole ?? undefined,
  };
}

export async function getBaseRuntimeMeFromSessionToken(sessionToken: string): Promise<RuntimeMe | null> {
  const decoded = decodeRuntimeSession(sessionToken);
  if (!decoded) return null;
  return toRuntimeMe(decoded);
}

export async function enrichRuntimeMe(me: RuntimeMe, rawSessionToken?: string | null): Promise<EnrichedRuntimeMe> {
  const decoded = rawSessionToken ? decodeRuntimeSession(rawSessionToken) : null;
  if (decoded && (decoded.actorOwnerId || decoded.actorStaffId)) {
    return {
      ...me,
      actorOwnerId: decoded.actorOwnerId ?? null,
      actorStaffId: decoded.actorStaffId ?? null,
      actorType: decoded.actorOwnerId ? 'owner' : decoded.actorStaffId ? 'staff' : null,
      opsActorId: decoded.actorOwnerId ?? decoded.actorStaffId ?? null,
    };
  }

  const actor = await resolveRuntimeOpsActor({
    cafeId: String(me.tenantId),
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

export async function getEnrichedRuntimeMeFromCookie(): Promise<EnrichedRuntimeMe | null> {
  const token = await getCookieValue(RUNTIME_SESSION_COOKIE);
  if (!token) return null;
  return getEnrichedRuntimeMeFromSessionToken(token);
}
