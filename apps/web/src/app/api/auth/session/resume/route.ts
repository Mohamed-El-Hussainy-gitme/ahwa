import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { setRuntimeSessionCookie } from '@/lib/auth/cookies';
import { decodeRuntimeResumeToken, encodeRuntimeResumeToken, RUNTIME_RESUME_MAX_AGE_SECONDS } from '@/lib/runtime/resume';
import { encodeRuntimeSession, RUNTIME_SESSION_MAX_AGE_SECONDS } from '@/lib/runtime/session';

const Input = z.object({
  token: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  const resumed = decodeRuntimeResumeToken(parsed.data.token);
  if (!resumed) {
    return NextResponse.json({ ok: false, error: 'RESUME_EXPIRED' }, { status: 401 });
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
  return response;
}
