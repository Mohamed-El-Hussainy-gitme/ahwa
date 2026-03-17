import { NextResponse } from 'next/server';
import {
  encodePlatformAdminSession,
  platformAdminCookieOptions,
  PLATFORM_ADMIN_COOKIE,
} from '@/lib/platform-auth/session';
import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import {
  assertPlatformEnv,
  platformFail,
  PlatformApiError,
} from '@/app/api/platform/_auth';

type LoginRpcRow = {
  super_admin_user_id?: string;
  email?: string;
  display_name?: string;
};

function isLoginRpcRow(value: unknown): value is LoginRpcRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    (typeof (value as { super_admin_user_id?: unknown }).super_admin_user_id ===
      'string' ||
      typeof (value as { super_admin_user_id?: unknown }).super_admin_user_id ===
        'undefined') &&
    (typeof (value as { email?: unknown }).email === 'string' ||
      typeof (value as { email?: unknown }).email === 'undefined') &&
    (typeof (value as { display_name?: unknown }).display_name === 'string' ||
      typeof (value as { display_name?: unknown }).display_name === 'undefined')
  );
}

function normalizeLoginRpcRow(data: unknown): LoginRpcRow | null {
  if (Array.isArray(data)) {
    const first = data[0];
    return isLoginRpcRow(first) ? first : null;
  }

  return isLoginRpcRow(data) ? data : null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
    };

    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? '';

    if (!email || !password) {
      return platformFail(400, 'INVALID_INPUT', 'Email and password are required.');
    }

    assertPlatformEnv();

    const admin = controlPlaneAdmin();

    const { data, error } = await admin.rpc('platform_verify_super_admin_login', {
      p_email: email,
      p_password: password,
    });

    if (error) {
      return platformFail(
        401,
        'BAD_CREDENTIALS',
        error.message || 'Super admin credentials are invalid.',
      );
    }

    const row = normalizeLoginRpcRow(data);

    if (!row?.super_admin_user_id || !row.email || !row.display_name) {
      return platformFail(
        401,
        'BAD_CREDENTIALS',
        'Super admin credentials are invalid.',
      );
    }

    const response = NextResponse.json({ ok: true });

    response.cookies.set(
      PLATFORM_ADMIN_COOKIE,
      encodePlatformAdminSession({
        superAdminUserId: row.super_admin_user_id,
        email: row.email,
        displayName: row.display_name,
      }),
      platformAdminCookieOptions(),
    );

    return response;
  } catch (error) {
    if (error instanceof PlatformApiError) {
      return platformFail(error.status, error.code, error.message);
    }

    const message =
      error instanceof Error ? error.message : 'PLATFORM_LOGIN_FAILED';

    return platformFail(500, 'PLATFORM_LOGIN_FAILED', message);
  }
}