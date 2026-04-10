import { NextResponse } from 'next/server';
import { getCookieValue, RUNTIME_SESSION_COOKIE, setRuntimeSessionCookie } from '@/lib/auth/cookies';
import {
  decodeRuntimeSession,
  encodeRuntimeSession,
  RUNTIME_SESSION_MAX_AGE_SECONDS,
  touchRuntimeSession,
} from '@/lib/runtime/session';

export async function POST() {
  const token = await getCookieValue(RUNTIME_SESSION_COOKIE);
  const session = decodeRuntimeSession(token);

  if (!session) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const refreshed = touchRuntimeSession(session);
  const response = NextResponse.json({ ok: true }, { status: 200 });
  setRuntimeSessionCookie(response, encodeRuntimeSession(refreshed), RUNTIME_SESSION_MAX_AGE_SECONDS);
  return response;
}
