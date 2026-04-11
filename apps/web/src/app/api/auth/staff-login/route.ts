import { NextRequest } from 'next/server';
import { z } from 'zod';
import { setGateSlugCookie, setRuntimeSessionCookie } from '@/lib/auth/cookies';
import { cafeSlugEquals, normalizeCafeSlug } from '@/lib/cafes/slug';
import { jsonWithRequestId, getRequestIdFromHeaders } from '@/lib/observability/http';
import { beginServerObservation, logServerObservation } from '@/lib/observability/server';
import { resolveCafeBindingBySlug } from '@/lib/ops/cafes';
import { encodeRuntimeResumeToken, RUNTIME_RESUME_MAX_AGE_SECONDS } from '@/lib/runtime/resume';
import { encodeRuntimeSession, RUNTIME_SESSION_MAX_AGE_SECONDS } from '@/lib/runtime/session';
import { supabaseAdminForDatabase } from '@/lib/supabase/admin';
import { isOperationalDatabaseConfigured } from '@/lib/supabase/env';

const Input = z.object({
  cafeSlug: z.string().min(1),
  name: z.string().min(1),
  pin: z.string().min(1),
});

function fail(status: number, code: string, requestId: string, message = code) {
  return jsonWithRequestId(
    {
      ok: false,
      error: { code, message },
    },
    requestId,
    { status },
  );
}

export async function POST(req: NextRequest) {
  const requestId = getRequestIdFromHeaders(req.headers);
  const body = await req.json().catch(() => ({}));
  const inputSlug = normalizeCafeSlug(typeof body?.cafeSlug === 'string' ? body.cafeSlug : '');
  const observation = beginServerObservation('auth.staff-login', {
    slug: inputSlug || null,
    hasName: typeof body?.name === 'string' && body.name.trim().length > 0,
  }, requestId);

  try {
    const parsed = Input.safeParse(body);
    if (!parsed.success) {
      logServerObservation(observation, 'error', { status: 400, code: 'INVALID_INPUT' });
      return fail(400, 'INVALID_INPUT', requestId);
    }

    const slug = normalizeCafeSlug(parsed.data.cafeSlug);
    let binding = null;
    try {
      binding = await resolveCafeBindingBySlug(slug);
    } catch {
      logServerObservation(observation, 'error', { status: 404, code: 'CAFE_NOT_FOUND' });
      return fail(404, 'CAFE_NOT_FOUND', requestId);
    }

    if (!binding || !binding.isActive) {
      logServerObservation(observation, 'error', { status: 404, code: 'CAFE_NOT_FOUND' });
      return fail(404, 'CAFE_NOT_FOUND', requestId);
    }

    if (!isOperationalDatabaseConfigured(binding.databaseKey)) {
      logServerObservation(observation, 'error', { status: 409, code: 'CAFE_DATABASE_UNAVAILABLE', databaseKey: binding.databaseKey });
      return fail(409, 'CAFE_DATABASE_UNAVAILABLE', requestId);
    }

    const rpc = await supabaseAdminForDatabase(binding.databaseKey).rpc('ops_verify_staff_pin_login', {
      p_slug: slug,
      p_identifier: parsed.data.name.trim(),
      p_pin: parsed.data.pin.trim(),
    });

    if (rpc.error) {
      logServerObservation(observation, 'error', { status: 401, code: 'LOGIN_FAILED', databaseKey: binding.databaseKey, message: rpc.error.message || 'LOGIN_FAILED' });
      return fail(401, 'LOGIN_FAILED', requestId, rpc.error.message || 'LOGIN_FAILED');
    }

    const row = Array.isArray(rpc.data) ? rpc.data[0] : null;
    if (!row?.staff_member_id) {
      logServerObservation(observation, 'error', { status: 401, code: 'BAD_CREDENTIALS', databaseKey: binding.databaseKey });
      return fail(401, 'BAD_CREDENTIALS', requestId);
    }

    const resolvedCafeId = String(row.cafe_id ?? '');
    if (!resolvedCafeId || resolvedCafeId !== binding.id) {
      logServerObservation(observation, 'error', { status: 409, code: 'CAFE_BINDING_MISMATCH', databaseKey: binding.databaseKey });
      return fail(409, 'CAFE_BINDING_MISMATCH', requestId);
    }

    const resolvedCafeSlug = normalizeCafeSlug(String(row.cafe_slug ?? binding.slug));
    if (!cafeSlugEquals(resolvedCafeSlug, binding.slug)) {
      logServerObservation(observation, 'error', { status: 409, code: 'CAFE_SLUG_MISMATCH', databaseKey: binding.databaseKey });
      return fail(409, 'CAFE_SLUG_MISMATCH', requestId);
    }

    const loginState = String(row.login_state ?? 'ok');
    if (loginState === 'no_shift') {
      logServerObservation(observation, 'error', { status: 409, code: 'NO_SHIFT', databaseKey: binding.databaseKey });
      return fail(409, 'NO_SHIFT', requestId, 'لا توجد وردية مفتوحة الآن');
    }
    if (loginState === 'not_assigned') {
      logServerObservation(observation, 'error', { status: 409, code: 'NOT_ASSIGNED', databaseKey: binding.databaseKey });
      return fail(409, 'NOT_ASSIGNED', requestId, 'لا يوجد لك دور في الوردية');
    }
    if (loginState !== 'ok' || !row.shift_id || !row.shift_role) {
      logServerObservation(observation, 'error', { status: 401, code: 'LOGIN_FAILED', databaseKey: binding.databaseKey });
      return fail(401, 'LOGIN_FAILED', requestId);
    }

    const session = {
      sessionVersion: 2 as const,
      databaseKey: binding.databaseKey,
      tenantId: binding.id,
      tenantSlug: binding.slug,
      userId: String(row.staff_member_id),
      fullName: String(row.full_name ?? ''),
      accountKind: 'employee' as const,
      shiftId: String(row.shift_id),
      shiftRole: String(row.shift_role) as 'supervisor' | 'waiter' | 'barista' | 'shisha' | 'american_waiter',
      actorOwnerId: null,
      actorStaffId: String(row.staff_member_id),
    };

    const token = encodeRuntimeSession(session);
    const resumeToken = encodeRuntimeResumeToken(session);
    const response = jsonWithRequestId({
      ok: true,
      resumeToken,
      resumeExpiresInSeconds: RUNTIME_RESUME_MAX_AGE_SECONDS,
      sessionExpiresInSeconds: RUNTIME_SESSION_MAX_AGE_SECONDS,
      tenant: { id: binding.id, slug: binding.slug },
      binding: { databaseKey: binding.databaseKey, bindingSource: binding.bindingSource },
      user: { id: String(row.staff_member_id), fullName: String(row.full_name ?? ''), accountKind: 'employee', shiftRole: String(row.shift_role) },
      shift: { id: String(row.shift_id) },
    }, requestId);

    setRuntimeSessionCookie(response, token, RUNTIME_SESSION_MAX_AGE_SECONDS);
    setGateSlugCookie(response, binding.slug);
    logServerObservation(observation, 'ok', {
      databaseKey: binding.databaseKey,
      accountKind: 'employee',
      shiftRole: String(row.shift_role),
      tenantId: binding.id,
      userId: String(row.staff_member_id),
    });
    return response;
  } catch (error) {
    logServerObservation(observation, 'error', { status: 500, code: 'STAFF_LOGIN_FAILED', message: error instanceof Error ? error.message : 'STAFF_LOGIN_FAILED' });
    return fail(500, 'STAFF_LOGIN_FAILED', requestId, error instanceof Error ? error.message : 'STAFF_LOGIN_FAILED');
  }
}
