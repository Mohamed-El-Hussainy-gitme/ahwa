import { NextRequest } from 'next/server';
import { getCookieValue, RUNTIME_SESSION_COOKIE, setRuntimeSessionCookie } from '@/lib/auth/cookies';
import { jsonWithRequestId, getRequestIdFromHeaders } from '@/lib/observability/http';
import { beginServerObservation, logServerObservation } from '@/lib/observability/server';
import { encodeRuntimeResumeToken, RUNTIME_RESUME_MAX_AGE_SECONDS } from '@/lib/runtime/resume';
import { decodeRuntimeSession, encodeRuntimeSession, RUNTIME_SESSION_MAX_AGE_SECONDS } from '@/lib/runtime/session';

function fail(status: number, error: string, requestId: string) {
  return jsonWithRequestId({ ok: false, error }, requestId, { status });
}

export async function GET(req: NextRequest) {
  const requestId = getRequestIdFromHeaders(req.headers);
  const observation = beginServerObservation('auth.session.refresh', undefined, requestId);

  try {
    const token = await getCookieValue(RUNTIME_SESSION_COOKIE);
    const session = decodeRuntimeSession(token);
    if (!session) {
      logServerObservation(observation, 'error', { status: 401, code: 'UNAUTHENTICATED' });
      return fail(401, 'UNAUTHENTICATED', requestId);
    }

    const refreshedSessionToken = encodeRuntimeSession(session);
    const resumeToken = encodeRuntimeResumeToken(session);
    const response = jsonWithRequestId({
      ok: true,
      resumeToken,
      resumeExpiresInSeconds: RUNTIME_RESUME_MAX_AGE_SECONDS,
      sessionExpiresInSeconds: RUNTIME_SESSION_MAX_AGE_SECONDS,
    }, requestId);
    setRuntimeSessionCookie(response, refreshedSessionToken, RUNTIME_SESSION_MAX_AGE_SECONDS);
    logServerObservation(observation, 'ok', {
      accountKind: session.accountKind,
      shiftRole: session.shiftRole ?? null,
      tenantId: session.tenantId,
      userId: session.userId,
    });
    return response;
  } catch (error) {
    logServerObservation(observation, 'error', { status: 500, code: 'SESSION_REFRESH_FAILED', message: error instanceof Error ? error.message : 'SESSION_REFRESH_FAILED' });
    return fail(500, 'SESSION_REFRESH_FAILED', requestId);
  }
}
