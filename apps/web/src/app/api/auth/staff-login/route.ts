import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { setGateSlugCookie, setRuntimeSessionCookie } from '@/lib/auth/cookies';
import { resolveCafeBySlug, resolveCafeDatabaseBinding } from '@/lib/ops/cafes';
import { encodeRuntimeSession, RUNTIME_SESSION_MAX_AGE_SECONDS } from '@/lib/runtime/session';
import { supabaseAdminForDatabase } from '@/lib/supabase/admin';
import { isOperationalDatabaseConfigured } from '@/lib/supabase/env';

const Input = z.object({
  cafeSlug: z.string().min(1),
  name: z.string().min(1),
  pin: z.string().min(1),
});

function fail(status: number, code: string, message = code) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = Input.safeParse(body);

  if (!parsed.success) {
    return fail(400, 'INVALID_INPUT');
  }

  const slug = parsed.data.cafeSlug.trim().toLowerCase();

  const cafe = await resolveCafeBySlug(slug);
  if (!cafe || !cafe.isActive) {
    return fail(404, 'CAFE_NOT_FOUND');
  }

  const binding = await resolveCafeDatabaseBinding(cafe.id);
  if (!binding) {
    return fail(409, 'CAFE_DATABASE_UNBOUND');
  }

  if (!isOperationalDatabaseConfigured(binding.databaseKey)) {
    return fail(409, 'CAFE_DATABASE_UNAVAILABLE');
  }

  const rpc = await supabaseAdminForDatabase(binding.databaseKey).rpc('ops_verify_staff_pin_login', {
    p_slug: slug,
    p_identifier: parsed.data.name.trim(),
    p_pin: parsed.data.pin.trim(),
  });

  if (rpc.error) {
    return fail(401, 'LOGIN_FAILED', rpc.error.message || 'LOGIN_FAILED');
  }

  const row = Array.isArray(rpc.data) ? rpc.data[0] : null;

  if (!row?.staff_member_id) {
    return fail(401, 'BAD_CREDENTIALS');
  }

  const resolvedCafeId = String(row.cafe_id ?? '');
  if (!resolvedCafeId || resolvedCafeId !== cafe.id) {
    return fail(409, 'CAFE_BINDING_MISMATCH');
  }

  const resolvedCafeSlug = String(row.cafe_slug ?? cafe.slug).trim().toLowerCase();
  if (resolvedCafeSlug !== cafe.slug) {
    return fail(409, 'CAFE_SLUG_MISMATCH');
  }

  const loginState = String(row.login_state ?? 'ok');

  if (loginState === 'no_shift') {
    return fail(409, 'NO_SHIFT', 'لا توجد وردية مفتوحة الآن');
  }

  if (loginState === 'not_assigned') {
    return fail(409, 'NOT_ASSIGNED', 'لا يوجد لك دور في الوردية');
  }

  if (loginState !== 'ok' || !row.shift_id || !row.shift_role) {
    return fail(401, 'LOGIN_FAILED');
  }

  const token = encodeRuntimeSession({
    sessionVersion: 2,
    databaseKey: binding.databaseKey,
    tenantId: cafe.id,
    tenantSlug: cafe.slug,
    userId: String(row.staff_member_id),
    fullName: String(row.full_name ?? ''),
    accountKind: 'employee',
    shiftId: String(row.shift_id),
    shiftRole: String(row.shift_role) as 'supervisor' | 'waiter' | 'barista' | 'shisha',
    actorOwnerId: null,
    actorStaffId: String(row.staff_member_id),
  });

  const response = NextResponse.json({
    ok: true,
    tenant: { id: cafe.id, slug: cafe.slug },
    binding: {
      databaseKey: binding.databaseKey,
      bindingSource: binding.bindingSource,
    },
    user: {
      id: String(row.staff_member_id),
      fullName: String(row.full_name ?? ''),
      accountKind: 'employee',
      shiftRole: String(row.shift_role),
    },
    shift: { id: String(row.shift_id) },
  });

  setRuntimeSessionCookie(response, token, RUNTIME_SESSION_MAX_AGE_SECONDS);
  setGateSlugCookie(response, cafe.slug);

  return response;
}
