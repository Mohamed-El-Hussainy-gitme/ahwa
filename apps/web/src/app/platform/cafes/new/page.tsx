import { PlatformChrome } from '@/app/platform/_components/PlatformChrome';
import { requirePlatformAdminSession } from '@/app/platform/_lib/server';
import PlatformCreateCafePageClient from './PlatformCreateCafePageClient';

export const dynamic = 'force-dynamic';

export default async function PlatformCreateCafePage() {
  const session = await requirePlatformAdminSession();

  return (
    <PlatformChrome
      session={session}
      title="إنشاء قهوة جديدة"
      description="نموذج مستقل لإضافة قهوة جديدة وفتح أول اشتراك ومالكها الأساسي بدون مزاحمة جدول القهاوي."
    >
      <PlatformCreateCafePageClient />
    </PlatformChrome>
  );
}
