import { PlatformChrome } from '@/app/platform/_components/PlatformChrome';
import { requirePlatformAdminSession } from '@/app/platform/_lib/server';
import PlatformCreateCafePageClient from './PlatformCreateCafePageClient';

export const dynamic = 'force-dynamic';

export default async function PlatformCreateCafePage() {
  const session = await requirePlatformAdminSession();

  return (
    <PlatformChrome
      session={session}
      title="إنشاء قهوة" description="أنشئ قهوة جديدة مع بيانات المالك والاشتراك وربط قاعدة التشغيل من شاشة واحدة."
    >
      <PlatformCreateCafePageClient />
    </PlatformChrome>
  );
}
