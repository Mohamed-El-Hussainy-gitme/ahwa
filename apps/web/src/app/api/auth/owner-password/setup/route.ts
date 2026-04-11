import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { setGateSlugCookie, setRuntimeSessionCookie } from '@/lib/auth/cookies';
import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import { mirrorOwnerToOperationalDatabase } from '@/lib/control-plane/runtime-provisioning';
import { normalizeCafeSlug } from '@/lib/cafes/slug';
import { resolveCafeBindingBySlug } from '@/lib/ops/cafes';
import { encodeRuntimeResumeToken, RUNTIME_RESUME_MAX_AGE_SECONDS } from '@/lib/runtime/resume';
import { encodeRuntimeSession, RUNTIME_SESSION_MAX_AGE_SECONDS } from '@/lib/runtime/session';
import { isOperationalDatabaseConfigured } from '@/lib/supabase/env';

const Input = z.object({
  slug: z.string().min(1),
  phone: z.string().min(1),
  setupCode: z.string().min(1),
  newPassword: z.string().min(8),
});

type SetupResponse = {
  ok?: boolean | null;
  cafe_id?: string | null;
  cafe_slug?: string | null;
  owner_user_id?: string | null;
  full_name?: string | null;
  owner_label?: string | null;
  password_state?: string | null;
};

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return fallback;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  const slug = normalizeCafeSlug(parsed.data.slug);
  if (!slug) {
    return NextResponse.json({ ok: false, error: 'MISSING_CAFE_SLUG' }, { status: 400 });
  }

  let binding = null;
  try {
    binding = await resolveCafeBindingBySlug(slug);
  } catch {
    return NextResponse.json({ ok: false, error: 'CAFE_NOT_FOUND' }, { status: 404 });
  }

  if (!binding || !binding.isActive) {
    return NextResponse.json({ ok: false, error: 'CAFE_NOT_FOUND' }, { status: 404 });
  }

  if (!isOperationalDatabaseConfigured(binding.databaseKey)) {
    return NextResponse.json({ ok: false, error: 'CAFE_DATABASE_UNAVAILABLE' }, { status: 409 });
  }

  const preflight = await controlPlaneAdmin().rpc('platform_validate_owner_password_setup', {
    p_slug: slug,
    p_phone: parsed.data.phone.trim(),
    p_setup_code: parsed.data.setupCode.trim(),
  });

  if (preflight.error) {
    return NextResponse.json({ ok: false, error: errorMessage(preflight.error, 'OWNER_PASSWORD_SETUP_FAILED') }, { status: 400 });
  }

  const preflightRow = (preflight.data ?? null) as SetupResponse | null;
  const preflightCafeId = String(preflightRow?.cafe_id ?? '');
  const preflightOwnerUserId = String(preflightRow?.owner_user_id ?? '');
  const preflightFullName = String(preflightRow?.full_name ?? '');
  const preflightOwnerLabel = preflightRow?.owner_label === 'partner' ? 'partner' : preflightRow?.owner_label === 'branch_manager' ? 'branch_manager' : 'owner';
  const resolvedSlug = normalizeCafeSlug(String(preflightRow?.cafe_slug ?? slug));

  if (!preflightCafeId || !preflightOwnerUserId || !resolvedSlug) {
    return NextResponse.json({ ok: false, error: 'OWNER_PASSWORD_SETUP_FAILED' }, { status: 400 });
  }

  if (binding.id !== preflightCafeId) {
    return NextResponse.json({ ok: false, error: 'CAFE_BINDING_MISMATCH' }, { status: 409 });
  }

  const rpc = await controlPlaneAdmin().rpc('platform_complete_owner_password_setup', {
    p_slug: slug,
    p_phone: parsed.data.phone.trim(),
    p_setup_code: parsed.data.setupCode.trim(),
    p_new_password: parsed.data.newPassword,
  });

  if (rpc.error) {
    return NextResponse.json({ ok: false, error: errorMessage(rpc.error, 'OWNER_PASSWORD_SETUP_FAILED') }, { status: 400 });
  }

  const row = (rpc.data ?? null) as SetupResponse | null;
  const cafeId = String(row?.cafe_id ?? preflightCafeId);
  const ownerUserId = String(row?.owner_user_id ?? preflightOwnerUserId);
  const fullName = String(row?.full_name ?? preflightFullName);
  const ownerLabel: 'owner' | 'partner' | 'branch_manager' = row?.owner_label === 'partner' ? 'partner' : preflightOwnerLabel;
  const confirmedSlug = normalizeCafeSlug(String(row?.cafe_slug ?? resolvedSlug));

  if (!cafeId || !ownerUserId || !confirmedSlug) {
    return NextResponse.json({ ok: false, error: 'OWNER_PASSWORD_SETUP_FAILED' }, { status: 400 });
  }

  try {
    await mirrorOwnerToOperationalDatabase(cafeId, ownerUserId);
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: 'OWNER_PASSWORD_SET_LOGIN_UNAVAILABLE',
        passwordSet: true,
        next: {
          action: 'login_manually',
          slug: confirmedSlug,
          phone: parsed.data.phone.trim(),
        },
      },
      { status: 409 },
    );
  }

  const session = {
    sessionVersion: 2 as const,
    databaseKey: binding.databaseKey,
    tenantId: binding.id,
    tenantSlug: binding.slug,
    userId: ownerUserId,
    fullName,
    accountKind: 'owner' as const,
    ownerLabel,
    actorOwnerId: ownerUserId,
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
    binding: { databaseKey: binding.databaseKey, bindingSource: binding.bindingSource },
    user: { id: ownerUserId, fullName, accountKind: 'owner', ownerLabel },
  });

  setRuntimeSessionCookie(response, token, RUNTIME_SESSION_MAX_AGE_SECONDS);
  setGateSlugCookie(response, binding.slug);
  return response;
}
