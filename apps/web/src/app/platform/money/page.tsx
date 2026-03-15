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
    >
      <MoneyFollowSection refreshKey={0} />
    </PlatformChrome>
  );
}
