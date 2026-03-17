import { createHmac, timingSafeEqual } from 'crypto';

export const RUNTIME_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export type RuntimeSessionPayload = {
  tenantId: string;
  tenantSlug: string;
  userId: string;
  fullName: string;
  accountKind: 'owner' | 'employee';
  ownerLabel?: 'owner' | 'partner';
  shiftId?: string | null;
  shiftRole?: 'supervisor' | 'waiter' | 'barista' | 'shisha' | null;
  actorOwnerId?: string | null;
  actorStaffId?: string | null;
};

function getSecret(): string {
  const secret = process.env.AHWA_SESSION_SECRET;
  if (!secret) throw new Error('AHWA_SESSION_SECRET is missing');
  return secret;
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload, 'utf8').digest('base64url');
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

    return {
      tenantId: parsed.tenantId,
      tenantSlug: parsed.tenantSlug,
      userId: parsed.userId,
      fullName: parsed.fullName,
      accountKind: parsed.accountKind,
      ownerLabel: parsed.ownerLabel === 'partner' ? 'partner' : parsed.ownerLabel === 'owner' ? 'owner' : undefined,
      shiftId: typeof parsed.shiftId === 'string' ? parsed.shiftId : null,
      shiftRole:
        parsed.shiftRole === 'supervisor' ||
        parsed.shiftRole === 'waiter' ||
        parsed.shiftRole === 'barista' ||
        parsed.shiftRole === 'shisha'
          ? parsed.shiftRole
          : null,
      actorOwnerId: typeof parsed.actorOwnerId === 'string' ? parsed.actorOwnerId : null,
      actorStaffId: typeof parsed.actorStaffId === 'string' ? parsed.actorStaffId : null,
    };
  } catch {
    return null;
  }
}
