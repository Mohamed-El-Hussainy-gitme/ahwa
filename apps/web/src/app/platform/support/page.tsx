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
    >
      <SupportSection refreshKey={0} selectedCafeId="" />
    </PlatformChrome>
  );
}
