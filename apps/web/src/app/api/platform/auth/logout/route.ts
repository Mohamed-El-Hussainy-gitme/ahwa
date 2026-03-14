import { NextResponse } from 'next/server';
import {
  PLATFORM_ADMIN_COOKIE,
  platformAdminCookieOptions,
} from '@/lib/platform-auth/session';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(PLATFORM_ADMIN_COOKIE, '', {
    ...platformAdminCookieOptions(),
    maxAge: 0,
  });
  return response;
}
