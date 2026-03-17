import { NextResponse } from 'next/server';
import {
  clearAuthCookies,
  getCookieValue,
  RUNTIME_SESSION_COOKIE,
} from '@/lib/auth/cookies';
import {
  getEnrichedRuntimeMeFromSessionToken,
  isUnboundRuntimeSessionError,
} from '@/lib/runtime/me';

export async function GET() {
  const token = await getCookieValue(RUNTIME_SESSION_COOKIE);
  if (!token) {
    const response = NextResponse.json(
      { error: { code: 'unauthorized', message: 'Missing runtime session.' } },
      { status: 401 },
    );
    clearAuthCookies(response);
    return response;
  }

  try {
    const me = await getEnrichedRuntimeMeFromSessionToken(token);
    if (!me) {
      const response = NextResponse.json(
        { error: { code: 'runtime_me_failed', message: 'Failed to resolve runtime user.' } },
        { status: 401 },
      );
      clearAuthCookies(response);
      return response;
    }

    return NextResponse.json(me, { status: 200 });
  } catch (error) {
    if (isUnboundRuntimeSessionError(error)) {
      const response = NextResponse.json(
        { error: { code: 'UNBOUND_RUNTIME_SESSION', message: 'Runtime session must be refreshed.' } },
        { status: 409 },
      );
      clearAuthCookies(response);
      return response;
    }
    throw error;
  }
}
