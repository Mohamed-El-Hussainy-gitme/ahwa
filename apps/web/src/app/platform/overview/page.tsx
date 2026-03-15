import { PlatformChrome } from '@/app/platform/_components/PlatformChrome';
import { requirePlatformAdminSession } from '@/app/platform/_lib/server';
import PlatformOverviewPageClient from './PlatformOverviewPageClient';

export const dynamic = 'force-dynamic';

export default async function PlatformOverviewPage() {
  const session = await requirePlatformAdminSession();

  return (
    <PlatformChrome
      session={session}
      title="نظرة عامة على المحفظة"
      description="ملخص موحد لحالة القهاوي، النشاط الحالي، الاشتراكات، وسرعة الوصول إلى الحالات التي تحتاج متابعة فورية."
    >
      <PlatformOverviewPageClient />
    </PlatformChrome>
  );
}
