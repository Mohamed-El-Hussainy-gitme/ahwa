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
  phone: z.string().min(1),
  password: z.string().min(1),
  slug: z.string().min(1).optional(),
});

function fail(status: number, error: string, requestId: string) {
  return jsonWithRequestId({ ok: false, error }, requestId, { status });
}

export async function POST(req: NextRequest) {
  const requestId = getRequestIdFromHeaders(req.headers);
  const body = await req.json().catch(() => ({}));
  const inputSlug = normalizeCafeSlug(typeof body?.slug === 'string' ? body.slug : '');
  const observation = beginServerObservation('auth.owner-login', {
    slug: inputSlug || null,
    hasPhone: typeof body?.phone === 'string' && body.phone.trim().length > 0,
  }, requestId);

  try {
    const parsed = Input.safeParse(body);
    if (!parsed.success) {
      logServerObservation(observation, 'error', { status: 400, code: 'INVALID_INPUT' });
      return fail(400, 'INVALID_INPUT', requestId);
    }

    const slug = normalizeCafeSlug(parsed.data.slug ?? '');
    if (!slug) {
      logServerObservation(observation, 'error', { status: 400, code: 'MISSING_CAFE_SLUG' });
      return fail(400, 'MISSING_CAFE_SLUG', requestId);
    }

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

    const rpc = await supabaseAdminForDatabase(binding.databaseKey).rpc('ops_verify_owner_login', {
      p_slug: slug,
      p_phone: parsed.data.phone.trim(),
      p_password: parsed.data.password,
    });

    if (rpc.error) {
      logServerObservation(observation, 'error', { status: 401, code: 'LOGIN_FAILED', databaseKey: binding.databaseKey, message: rpc.error.message || 'LOGIN_FAILED' });
      return fail(401, 'LOGIN_FAILED', requestId);
    }

    const row = Array.isArray(rpc.data) ? rpc.data[0] : null;
    if (!row?.owner_user_id) {
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

    const ownerLabel: 'owner' | 'partner' | 'branch_manager' =
      row.owner_label === 'partner' ? 'partner' : row.owner_label === 'branch_manager' ? 'branch_manager' : 'owner';

    const session = {
      sessionVersion: 2 as const,
      databaseKey: binding.databaseKey,
      tenantId: binding.id,
      tenantSlug: binding.slug,
      userId: String(row.owner_user_id),
      fullName: String(row.full_name ?? ''),
      accountKind: 'owner' as const,
      ownerLabel,
      actorOwnerId: String(row.owner_user_id),
      actorStaffId: null,
      shiftId: null,
      shiftRole: null,
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
      user: { id: String(row.owner_user_id), fullName: String(row.full_name ?? ''), accountKind: 'owner', ownerLabel },
    }, requestId);
    setRuntimeSessionCookie(response, token, RUNTIME_SESSION_MAX_AGE_SECONDS);
    setGateSlugCookie(response, binding.slug);
    logServerObservation(observation, 'ok', {
      databaseKey: binding.databaseKey,
      accountKind: 'owner',
      ownerLabel,
      tenantId: binding.id,
      userId: String(row.owner_user_id),
    });
    return response;
  } catch (error) {
    logServerObservation(observation, 'error', { status: 500, code: 'OWNER_LOGIN_FAILED', message: error instanceof Error ? error.message : 'OWNER_LOGIN_FAILED' });
    return fail(500, 'OWNER_LOGIN_FAILED', requestId);
  }
}
