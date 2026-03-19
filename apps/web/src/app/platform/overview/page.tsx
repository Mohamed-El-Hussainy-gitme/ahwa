import { PlatformChrome } from '@/app/platform/_components/PlatformChrome';
import { requirePlatformAdminSession } from '@/app/platform/_lib/server';
import PlatformOverviewPageClient from './PlatformOverviewPageClient';

export const dynamic = 'force-dynamic';

export default async function PlatformOverviewPage() {
  const session = await requirePlatformAdminSession();

  return (
    <PlatformChrome
      session={session}
      title="نظرة عامة" description="ابدأ بالحالات التي تحتاج تدخل الآن، ثم انتقل إلى السجل أو الدعم من نفس الصفحة."
    >
      <PlatformOverviewPageClient />
    </PlatformChrome>
  );
}
