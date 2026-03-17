import type { NextResponse } from 'next/server';
import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';

export const OPERATIONAL_DATABASE_KEY_COOKIE = 'ahwa_operational_db';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function setOperationalDatabaseKeyCookie(response: NextResponse, databaseKey: string) {
  response.cookies.set(OPERATIONAL_DATABASE_KEY_COOKIE, databaseKey, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
  });
}

export function clearOperationalDatabaseKeyCookie(response: NextResponse) {
  response.cookies.set(OPERATIONAL_DATABASE_KEY_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}

export function readOperationalDatabaseKeyCookie(cookieStore: Pick<ReadonlyRequestCookies, 'get'>): string | null {
  const raw = cookieStore.get(OPERATIONAL_DATABASE_KEY_COOKIE)?.value?.trim() ?? '';
  return raw || null;
}
