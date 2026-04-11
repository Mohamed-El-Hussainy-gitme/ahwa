import { NextResponse } from 'next/server';
import { beginServerObservation, logServerObservation } from '@/lib/observability/server';
import { getCookieValue, RUNTIME_SESSION_COOKIE, setRuntimeSessionCookie } from '@/lib/auth/cookies';
import { encodeRuntimeResumeToken, RUNTIME_RESUME_MAX_AGE_SECONDS } from '@/lib/runtime/resume';
import { decodeRuntimeSession, encodeRuntimeSession, RUNTIME_SESSION_MAX_AGE_SECONDS } from '@/lib/runtime/session';

export async function GET(request: Request) {
  const observation = beginServerObservation('auth.session-refresh', {
    path: new URL(request.url).pathname,
    method: request.method,
  }, request.headers.get('x-request-id'));

  try {
    const token = await getCookieValue(RUNTIME_SESSION_COOKIE);
    const session = decodeRuntimeSession(token);
    if (!session) {
      logServerObservation(observation, 'error', { status: 401, code: 'UNAUTHENTICATED' });
      const response = NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });
      response.headers.set('x-request-id', observation.requestId);
      return response;
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
    response.headers.set('x-request-id', observation.requestId);
    logServerObservation(observation, 'ok', {
      status: 200,
      accountKind: session.accountKind,
      shiftRole: session.shiftRole ?? null,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'SESSION_REFRESH_FAILED';
    logServerObservation(observation, 'error', { status: 500, message });
    const response = NextResponse.json({ ok: false, error: 'SESSION_REFRESH_FAILED' }, { status: 500 });
    response.headers.set('x-request-id', observation.requestId);
    return response;
  }
}
