import { NextRequest } from 'next/server';
import { z } from 'zod';
import { setRuntimeSessionCookie } from '@/lib/auth/cookies';
import { jsonWithRequestId, getRequestIdFromHeaders } from '@/lib/observability/http';
import { beginServerObservation, logServerObservation } from '@/lib/observability/server';
import { decodeRuntimeResumeToken, encodeRuntimeResumeToken, RUNTIME_RESUME_MAX_AGE_SECONDS } from '@/lib/runtime/resume';
import { encodeRuntimeSession, RUNTIME_SESSION_MAX_AGE_SECONDS } from '@/lib/runtime/session';

const Input = z.object({
  token: z.string().min(1),
});

function fail(status: number, error: string, requestId: string) {
  return jsonWithRequestId({ ok: false, error }, requestId, { status });
}

export async function POST(req: NextRequest) {
  const requestId = getRequestIdFromHeaders(req.headers);
  const observation = beginServerObservation('auth.session.resume', undefined, requestId);

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = Input.safeParse(body);
    if (!parsed.success) {
      logServerObservation(observation, 'error', { status: 400, code: 'INVALID_INPUT' });
      return fail(400, 'INVALID_INPUT', requestId);
    }

    const resumed = decodeRuntimeResumeToken(parsed.data.token);
    if (!resumed) {
      logServerObservation(observation, 'error', { status: 401, code: 'RESUME_EXPIRED' });
      return fail(401, 'RESUME_EXPIRED', requestId);
    }

    const runtimeToken = encodeRuntimeSession(resumed.session);
    const resumeToken = encodeRuntimeResumeToken(resumed.session);
    const response = jsonWithRequestId({
      ok: true,
      resumeToken,
      resumeExpiresInSeconds: RUNTIME_RESUME_MAX_AGE_SECONDS,
      sessionExpiresInSeconds: RUNTIME_SESSION_MAX_AGE_SECONDS,
      accountKind: resumed.session.accountKind,
      shiftRole: resumed.session.shiftRole ?? null,
    }, requestId);
    setRuntimeSessionCookie(response, runtimeToken, RUNTIME_SESSION_MAX_AGE_SECONDS);
    logServerObservation(observation, 'ok', {
      accountKind: resumed.session.accountKind,
      shiftRole: resumed.session.shiftRole ?? null,
      tenantId: resumed.session.tenantId,
      userId: resumed.session.userId,
    });
    return response;
  } catch (error) {
    logServerObservation(observation, 'error', { status: 500, code: 'SESSION_RESUME_FAILED', message: error instanceof Error ? error.message : 'SESSION_RESUME_FAILED' });
    return fail(500, 'SESSION_RESUME_FAILED', requestId);
  }
}
