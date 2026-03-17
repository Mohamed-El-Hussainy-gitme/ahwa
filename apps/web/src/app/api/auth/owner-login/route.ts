import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { setGateSlugCookie, setRuntimeSessionCookie } from '@/lib/auth/cookies';
import { encodeRuntimeSession, RUNTIME_SESSION_MAX_AGE_SECONDS } from '@/lib/runtime/session';
import { resolveCafeBySlug, resolveCafeDatabaseBinding } from '@/lib/ops/cafes';
import { supabaseAdminForDatabase } from '@/lib/supabase/admin';
import { isOperationalDatabaseConfigured } from '@/lib/supabase/env';

const Input = z.object({
  phone: z.string().min(1),
  password: z.string().min(1),
  slug: z.string().min(1).optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  const slug = parsed.data.slug?.trim().toLowerCase() ?? '';
  if (!slug) {
    return NextResponse.json({ ok: false, error: 'MISSING_CAFE_SLUG' }, { status: 400 });
  }

  const cafe = await resolveCafeBySlug(slug);
  if (!cafe || !cafe.isActive) {
    return NextResponse.json({ ok: false, error: 'CAFE_NOT_FOUND' }, { status: 404 });
  }

  const binding = await resolveCafeDatabaseBinding(cafe.id);
  if (!binding) {
    return NextResponse.json({ ok: false, error: 'CAFE_DATABASE_UNBOUND' }, { status: 409 });
  }

  if (!isOperationalDatabaseConfigured(binding.databaseKey)) {
    return NextResponse.json(
      { ok: false, error: 'CAFE_DATABASE_UNAVAILABLE' },
      { status: 409 },
    );
  }

  const rpc = await supabaseAdminForDatabase(binding.databaseKey).rpc('ops_verify_owner_login', {
    p_slug: slug,
    p_phone: parsed.data.phone.trim(),
    p_password: parsed.data.password,
  });

  if (rpc.error) {
    return NextResponse.json({ ok: false, error: 'LOGIN_FAILED' }, { status: 401 });
  }

  const row = Array.isArray(rpc.data) ? rpc.data[0] : null;
  if (!row?.owner_user_id) {
    return NextResponse.json({ ok: false, error: 'BAD_CREDENTIALS' }, { status: 401 });
  }

  const resolvedCafeId = String(row.cafe_id ?? '');
  if (!resolvedCafeId || resolvedCafeId !== cafe.id) {
    return NextResponse.json({ ok: false, error: 'CAFE_BINDING_MISMATCH' }, { status: 409 });
  }

  const resolvedCafeSlug = String(row.cafe_slug ?? cafe.slug).trim().toLowerCase();
  if (resolvedCafeSlug !== cafe.slug) {
    return NextResponse.json({ ok: false, error: 'CAFE_SLUG_MISMATCH' }, { status: 409 });
  }

  const token = encodeRuntimeSession({
    sessionVersion: 2,
    databaseKey: binding.databaseKey,
    tenantId: cafe.id,
    tenantSlug: cafe.slug,
    userId: String(row.owner_user_id),
    fullName: String(row.full_name ?? ''),
    accountKind: 'owner',
    ownerLabel: row.owner_label === 'partner' ? 'partner' : 'owner',
    actorOwnerId: String(row.owner_user_id),
    actorStaffId: null,
    shiftId: null,
    shiftRole: null,
  });

  const response = NextResponse.json({
    ok: true,
    tenant: { id: cafe.id, slug: cafe.slug },
    binding: {
      databaseKey: binding.databaseKey,
      bindingSource: binding.bindingSource,
    },
    user: {
      id: String(row.owner_user_id),
      fullName: String(row.full_name ?? ''),
      accountKind: 'owner',
      ownerLabel: row.owner_label === 'partner' ? 'partner' : 'owner',
    },
  });
  setRuntimeSessionCookie(response, token, RUNTIME_SESSION_MAX_AGE_SECONDS);
  setGateSlugCookie(response, cafe.slug);
  return response;
}
