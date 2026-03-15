import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { decodePlatformAdminSession, PLATFORM_ADMIN_COOKIE, type PlatformAdminSession } from '@/lib/platform-auth/session';

export async function requirePlatformAdminSession(): Promise<PlatformAdminSession> {
  const jar = await cookies();
  const session = decodePlatformAdminSession(jar.get(PLATFORM_ADMIN_COOKIE)?.value);
  if (!session) {
    redirect('/platform/login');
  }
  return session;
}
