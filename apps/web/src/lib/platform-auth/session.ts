import { createHmac, timingSafeEqual } from 'crypto';

export const PLATFORM_ADMIN_COOKIE = 'ahwa_platform_admin';

export type PlatformAdminSession = {
  superAdminUserId: string;
  email: string;
  displayName: string;
};

function getSecret(): string {
  const secret = process.env.AHWA_SESSION_SECRET;
  if (!secret) throw new Error('AHWA_SESSION_SECRET is missing');
  return secret;
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload, 'utf8').digest('base64url');
}

export function encodePlatformAdminSession(session: PlatformAdminSession): string {
  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function decodePlatformAdminSession(raw: string | null | undefined): PlatformAdminSession | null {
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
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<PlatformAdminSession>;
    if (!parsed || typeof parsed.superAdminUserId !== 'string' || typeof parsed.email !== 'string' || typeof parsed.displayName !== 'string') {
      return null;
    }
    return {
      superAdminUserId: parsed.superAdminUserId,
      email: parsed.email,
      displayName: parsed.displayName,
    };
  } catch {
    return null;
  }
}

export function platformAdminCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
  };
}
