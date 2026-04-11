import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { setGateSlugCookie, setRuntimeSessionCookie } from '@/lib/auth/cookies';
import { cafeSlugEquals, normalizeCafeSlug } from '@/lib/cafes/slug';
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

export async function POST(req: NextRequest) {
  const observation = beginServerObservation('auth.owner-login', {
    path: req.nextUrl.pathname,
    method: req.method,
  }, req.headers.get('x-request-id'));

  const fail = (status: number, code: string) => {
    logServerObservation(observation, 'error', { status, code });
    const response = NextResponse.json({ ok: false, error: code }, { status });
    response.headers.set('x-request-id', observation.requestId);
    return response;
  };

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = Input.safeParse(body);
    if (!parsed.success) {
      return fail(400, 'INVALID_INPUT');
    }

    const slug = normalizeCafeSlug(parsed.data.slug ?? '');
    if (!slug) {
      return fail(400, 'MISSING_CAFE_SLUG');
    }

    let binding = null;
    try {
      binding = await resolveCafeBindingBySlug(slug);
    } catch {
      return fail(404, 'CAFE_NOT_FOUND');
    }

    if (!binding || !binding.isActive) {
      return fail(404, 'CAFE_NOT_FOUND');
    }

    if (!isOperationalDatabaseConfigured(binding.databaseKey)) {
      return fail(409, 'CAFE_DATABASE_UNAVAILABLE');
    }

    const rpc = await supabaseAdminForDatabase(binding.databaseKey).rpc('ops_verify_owner_login', {
      p_slug: slug,
      p_phone: parsed.data.phone.trim(),
      p_password: parsed.data.password,
    });

    if (rpc.error) {
      return fail(401, 'LOGIN_FAILED');
    }

    const row = Array.isArray(rpc.data) ? rpc.data[0] : null;
    if (!row?.owner_user_id) {
      return fail(401, 'BAD_CREDENTIALS');
    }

    const resolvedCafeId = String(row.cafe_id ?? '');
    if (!resolvedCafeId || resolvedCafeId !== binding.id) {
      return fail(409, 'CAFE_BINDING_MISMATCH');
    }

    const resolvedCafeSlug = normalizeCafeSlug(String(row.cafe_slug ?? binding.slug));
    if (!cafeSlugEquals(resolvedCafeSlug, binding.slug)) {
      return fail(409, 'CAFE_SLUG_MISMATCH');
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

    const response = NextResponse.json({
      ok: true,
      resumeToken,
      resumeExpiresInSeconds: RUNTIME_RESUME_MAX_AGE_SECONDS,
      sessionExpiresInSeconds: RUNTIME_SESSION_MAX_AGE_SECONDS,
      tenant: { id: binding.id, slug: binding.slug },
      binding: {
        databaseKey: binding.databaseKey,
        bindingSource: binding.bindingSource,
      },
      user: {
        id: String(row.owner_user_id),
        fullName: String(row.full_name ?? ''),
        accountKind: 'owner',
        ownerLabel,
      },
    });
    setRuntimeSessionCookie(response, token, RUNTIME_SESSION_MAX_AGE_SECONDS);
    setGateSlugCookie(response, binding.slug);
    response.headers.set('x-request-id', observation.requestId);
    logServerObservation(observation, 'ok', {
      status: 200,
      cafeSlug: binding.slug,
      databaseKey: binding.databaseKey,
      ownerLabel,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OWNER_LOGIN_FAILED';
    logServerObservation(observation, 'error', { status: 500, message });
    const response = NextResponse.json({ ok: false, error: 'LOGIN_FAILED' }, { status: 500 });
    response.headers.set('x-request-id', observation.requestId);
    return response;
  }
}
