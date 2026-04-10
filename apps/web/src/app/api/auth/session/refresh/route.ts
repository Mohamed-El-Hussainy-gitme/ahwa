import { NextResponse } from 'next/server';
import { getCookieValue, RUNTIME_SESSION_COOKIE, setRuntimeSessionCookie } from '@/lib/auth/cookies';
import { encodeRuntimeResumeToken, RUNTIME_RESUME_MAX_AGE_SECONDS } from '@/lib/runtime/resume';
import { decodeRuntimeSession, encodeRuntimeSession, RUNTIME_SESSION_MAX_AGE_SECONDS } from '@/lib/runtime/session';

export async function GET() {
  const token = await getCookieValue(RUNTIME_SESSION_COOKIE);
  const session = decodeRuntimeSession(token);
  if (!session) {
    return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const refreshedSessionToken = encodeRuntimeSession(session);
  const resumeToken = encodeRuntimeResumeToken(session);
  const response = NextResponse.json({
    ok: true,
    resumeToken,
    resumeExpiresInSeconds: RUNTIME_RESUME_MAX_AGE_SECONDS,
    sessionExpiresInSeconds: RUNTIME_SESSION_MAX_AGE_SECONDS,
  });
  setRuntimeSessionCookie(response, refreshedSessionToken, RUNTIME_SESSION_MAX_AGE_SECONDS);
  return response;
}
