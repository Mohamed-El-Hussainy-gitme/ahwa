import { createHmac, timingSafeEqual } from 'crypto';
import type { NextResponse } from 'next/server';

export const PLATFORM_SUPPORT_COOKIE = 'ahwa_platform_support';

export type PlatformSupportScope = 'diagnostic' | 'read_only' | 'guided_write';

export type PlatformSupportSession = {
  requestId: string;
  superAdminUserId: string;
  cafeId: string;
  databaseKey: string;
  scope: PlatformSupportScope;
  expiresAt: string;
};

function getSecret(): string {
  const secret = process.env.AHWA_SESSION_SECRET;
  if (!secret) throw new Error('AHWA_SESSION_SECRET is missing');
  return secret;
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload, 'utf8').digest('base64url');
}

export function encodePlatformSupportSession(session: PlatformSupportSession): string {
  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function decodePlatformSupportSession(raw: string | null | undefined): PlatformSupportSession | null {
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
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<PlatformSupportSession>;
    if (!parsed) return null;
    if (typeof parsed.requestId !== 'string') return null;
    if (typeof parsed.superAdminUserId !== 'string') return null;
    if (typeof parsed.cafeId !== 'string') return null;
    if (typeof parsed.databaseKey !== 'string') return null;
    if (parsed.scope !== 'diagnostic' && parsed.scope !== 'read_only' && parsed.scope !== 'guided_write') return null;
    if (typeof parsed.expiresAt !== 'string') return null;
    return {
      requestId: parsed.requestId,
      superAdminUserId: parsed.superAdminUserId,
      cafeId: parsed.cafeId,
      databaseKey: parsed.databaseKey,
      scope: parsed.scope,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

export function isPlatformSupportSessionExpired(session: PlatformSupportSession): boolean {
  const expiresAt = new Date(session.expiresAt);
  return Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now();
}

export function setPlatformSupportCookie(response: NextResponse, session: PlatformSupportSession) {
  const expiresAt = new Date(session.expiresAt);
  const maxAge = Number.isNaN(expiresAt.getTime()) ? 0 : Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));

  response.cookies.set(PLATFORM_SUPPORT_COOKIE, encodePlatformSupportSession(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
}

export function clearPlatformSupportCookie(response: NextResponse) {
  response.cookies.set(PLATFORM_SUPPORT_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
