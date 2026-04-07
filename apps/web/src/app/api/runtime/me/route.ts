import { NextResponse } from 'next/server';
import { getCookieValue, RUNTIME_SESSION_COOKIE } from '@/lib/auth/cookies';
import {
  getEnrichedRuntimeMeFromSessionToken,
  isSupportRuntimeSessionError,
  isUnboundRuntimeSessionError,
} from '@/lib/runtime/me';

export async function GET() {
  const token = await getCookieValue(RUNTIME_SESSION_COOKIE);
  if (!token) {
    return NextResponse.json(
      { error: { code: 'unauthorized', message: 'Missing runtime session.' } },
      { status: 401 },
    );
  }

  try {
    const me = await getEnrichedRuntimeMeFromSessionToken(token);
    if (!me) {
      return NextResponse.json(
        { error: { code: 'runtime_me_failed', message: 'Failed to resolve runtime user.' } },
        { status: 401 },
      );
    }

    return NextResponse.json(me, { status: 200 });
  } catch (error) {
    if (isUnboundRuntimeSessionError(error) || isSupportRuntimeSessionError(error)) {
      return NextResponse.json(
        { error: { code: 'UNBOUND_RUNTIME_SESSION', message: 'Runtime session must be refreshed.' } },
        { status: 409 },
      );
    }
    throw error;
  }
}
