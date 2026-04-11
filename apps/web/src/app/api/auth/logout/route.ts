import { NextRequest } from 'next/server';
import { clearAuthCookies } from '@/lib/auth/cookies';
import { jsonWithRequestId, getRequestIdFromHeaders } from '@/lib/observability/http';
import { beginServerObservation, logServerObservation } from '@/lib/observability/server';

export async function POST(req: NextRequest) {
  const requestId = getRequestIdFromHeaders(req.headers);
  const observation = beginServerObservation('auth.logout', undefined, requestId);

  try {
    const response = jsonWithRequestId({ ok: true }, requestId);
    clearAuthCookies(response);
    logServerObservation(observation, 'ok');
    return response;
  } catch (error) {
    logServerObservation(observation, 'error', { status: 500, code: 'LOGOUT_FAILED', message: error instanceof Error ? error.message : 'LOGOUT_FAILED' });
    return jsonWithRequestId({ ok: false, error: 'LOGOUT_FAILED' }, requestId, { status: 500 });
  }
}
