import { PlatformChrome } from '@/app/platform/_components/PlatformChrome';
import { requirePlatformAdminSession } from '@/app/platform/_lib/server';
import { SupportSection } from '../PlatformDashboardClient';

export const dynamic = 'force-dynamic';

export default async function PlatformSupportPage() {
  const session = await requirePlatformAdminSession();

  return (
    <PlatformChrome
      session={session}
      title="الدعم الفني" description="ابدأ بالعناصر الجديدة وعالية الأولوية، ثم فعّل الوصول المؤقت فقط عند الحاجة."
    >
      <SupportSection refreshKey={0} selectedCafeId="" />
    </PlatformChrome>
  );
}
