import { PlatformChrome } from '@/app/platform/_components/PlatformChrome';
import { requirePlatformAdminSession } from '@/app/platform/_lib/server';
import { SupportSection } from '../PlatformDashboardClient';

export const dynamic = 'force-dynamic';

export default async function PlatformSupportPage() {
  const session = await requirePlatformAdminSession();

  return (
    <PlatformChrome
      session={session}
      title="الدعم الفني"
      description="صفحة مستقلة لرسائل الدعم الفني، الردود الداخلية، وحركة الحالات الجديدة وقيد المتابعة والمغلقة."
    >
      <SupportSection refreshKey={0} selectedCafeId="" />
    </PlatformChrome>
  );
}
