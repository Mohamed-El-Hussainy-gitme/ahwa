import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { decodePlatformAdminSession, PLATFORM_ADMIN_COOKIE } from '@/lib/platform-auth/session';
import PlatformDashboardClient from './PlatformDashboardClient';

export const dynamic = 'force-dynamic';

export default async function PlatformPage() {
  const jar = await cookies();
  const session = decodePlatformAdminSession(jar.get(PLATFORM_ADMIN_COOKIE)?.value);
  if (!session) redirect('/platform/login');
  return <PlatformDashboardClient session={session} />;
}
