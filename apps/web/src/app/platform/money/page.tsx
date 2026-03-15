import { PlatformChrome } from '@/app/platform/_components/PlatformChrome';
import { requirePlatformAdminSession } from '@/app/platform/_lib/server';
import { MoneyFollowSection } from '../PlatformDashboardClient';

export const dynamic = 'force-dynamic';

export default async function PlatformMoneyPage() {
  const session = await requirePlatformAdminSession();

  return (
    <PlatformChrome
      session={session}
      title="التحصيل والاشتراكات"
      description="صفحة مستقلة لمتابعة من دفع، من اقترب اشتراكه من الانتهاء، ومن يحتاج متابعة مالية مباشرة."
    >
      <MoneyFollowSection refreshKey={0} />
    </PlatformChrome>
  );
}
