import { NextResponse } from 'next/server';
import { clearAuthCookies } from '@/lib/auth/cookies';
import { beginServerObservation, logServerObservation } from '@/lib/observability/server';

export async function POST(request: Request) {
  const observation = beginServerObservation('auth.logout', {
    path: new URL(request.url).pathname,
    method: request.method,
  }, request.headers.get('x-request-id'));

  try {
    const response = NextResponse.json({ ok: true });
    clearAuthCookies(response);
    response.headers.set('x-request-id', observation.requestId);
    logServerObservation(observation, 'ok', { status: 200 });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'LOGOUT_FAILED';
    logServerObservation(observation, 'error', { status: 500, message });
    const response = NextResponse.json({ ok: false, error: 'LOGOUT_FAILED' }, { status: 500 });
    response.headers.set('x-request-id', observation.requestId);
    return response;
  }
}
