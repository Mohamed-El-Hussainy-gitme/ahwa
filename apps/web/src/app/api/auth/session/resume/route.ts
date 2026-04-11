import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { beginServerObservation, logServerObservation } from '@/lib/observability/server';
import { setRuntimeSessionCookie } from '@/lib/auth/cookies';
import { decodeRuntimeResumeToken, encodeRuntimeResumeToken, RUNTIME_RESUME_MAX_AGE_SECONDS } from '@/lib/runtime/resume';
import { encodeRuntimeSession, RUNTIME_SESSION_MAX_AGE_SECONDS } from '@/lib/runtime/session';

const Input = z.object({
  token: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const observation = beginServerObservation('auth.session-resume', {
    path: req.nextUrl.pathname,
    method: req.method,
  }, req.headers.get('x-request-id'));

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = Input.safeParse(body);
    if (!parsed.success) {
      logServerObservation(observation, 'error', { status: 400, code: 'INVALID_INPUT' });
      const response = NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
      response.headers.set('x-request-id', observation.requestId);
      return response;
    }

    const resumed = decodeRuntimeResumeToken(parsed.data.token);
    if (!resumed) {
      logServerObservation(observation, 'error', { status: 401, code: 'RESUME_EXPIRED' });
      const response = NextResponse.json({ ok: false, error: 'RESUME_EXPIRED' }, { status: 401 });
      response.headers.set('x-request-id', observation.requestId);
      return response;
    }

    const runtimeToken = encodeRuntimeSession(resumed.session);
    const resumeToken = encodeRuntimeResumeToken(resumed.session);
    const response = NextResponse.json({
      ok: true,
      resumeToken,
      resumeExpiresInSeconds: RUNTIME_RESUME_MAX_AGE_SECONDS,
      sessionExpiresInSeconds: RUNTIME_SESSION_MAX_AGE_SECONDS,
      accountKind: resumed.session.accountKind,
      shiftRole: resumed.session.shiftRole ?? null,
    });
    setRuntimeSessionCookie(response, runtimeToken, RUNTIME_SESSION_MAX_AGE_SECONDS);
    response.headers.set('x-request-id', observation.requestId);
    logServerObservation(observation, 'ok', {
      status: 200,
      accountKind: resumed.session.accountKind,
      shiftRole: resumed.session.shiftRole ?? null,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'SESSION_RESUME_FAILED';
    logServerObservation(observation, 'error', { status: 500, message });
    const response = NextResponse.json({ ok: false, error: 'SESSION_RESUME_FAILED' }, { status: 500 });
    response.headers.set('x-request-id', observation.requestId);
    return response;
  }
}
