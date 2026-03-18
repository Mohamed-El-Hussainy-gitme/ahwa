import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { setGateSlugCookie, setRuntimeSessionCookie } from '@/lib/auth/cookies';
import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import { mirrorOwnerToOperationalDatabase } from '@/lib/control-plane/runtime-provisioning';
import { normalizeCafeSlug } from '@/lib/cafes/slug';
import { resolveCafeBindingBySlug } from '@/lib/ops/cafes';
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
};

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

  const rpc = await controlPlaneAdmin().rpc('platform_complete_owner_password_setup', {
    p_slug: slug,
    p_phone: parsed.data.phone.trim(),
    p_setup_code: parsed.data.setupCode.trim(),
    p_new_password: parsed.data.newPassword,
  });

  if (rpc.error) {
    const message = typeof rpc.error.message === 'string' ? rpc.error.message : 'OWNER_PASSWORD_SETUP_FAILED';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }

  const row = (rpc.data ?? null) as SetupResponse | null;
  const cafeId = String(row?.cafe_id ?? '');
  const ownerUserId = String(row?.owner_user_id ?? '');
  const fullName = String(row?.full_name ?? '');
  const ownerLabel = row?.owner_label === 'partner' ? 'partner' : 'owner';
  const resolvedSlug = normalizeCafeSlug(String(row?.cafe_slug ?? slug));

  if (!cafeId || !ownerUserId || !resolvedSlug) {
    return NextResponse.json({ ok: false, error: 'OWNER_PASSWORD_SETUP_FAILED' }, { status: 400 });
  }

  await mirrorOwnerToOperationalDatabase(cafeId, ownerUserId);

  let binding = null;
  try {
    binding = await resolveCafeBindingBySlug(resolvedSlug);
  } catch {
    return NextResponse.json({ ok: false, error: 'CAFE_NOT_FOUND' }, { status: 404 });
  }

  if (!binding || !binding.isActive) {
    return NextResponse.json({ ok: false, error: 'CAFE_NOT_FOUND' }, { status: 404 });
  }

  if (!isOperationalDatabaseConfigured(binding.databaseKey)) {
    return NextResponse.json({ ok: false, error: 'CAFE_DATABASE_UNAVAILABLE' }, { status: 409 });
  }

  const token = encodeRuntimeSession({
    sessionVersion: 2,
    databaseKey: binding.databaseKey,
    tenantId: binding.id,
    tenantSlug: binding.slug,
    userId: ownerUserId,
    fullName,
    accountKind: 'owner',
    ownerLabel,
    actorOwnerId: ownerUserId,
    actorStaffId: null,
    shiftId: null,
    shiftRole: null,
  });

  const response = NextResponse.json({
    ok: true,
    tenant: { id: binding.id, slug: binding.slug },
    binding: { databaseKey: binding.databaseKey, bindingSource: binding.bindingSource },
    user: { id: ownerUserId, fullName, accountKind: 'owner', ownerLabel },
  });

  setRuntimeSessionCookie(response, token, RUNTIME_SESSION_MAX_AGE_SECONDS);
  setGateSlugCookie(response, binding.slug);
  return response;
}
