import { PlatformChrome } from '@/app/platform/_components/PlatformChrome';
import { requirePlatformAdminSession } from '@/app/platform/_lib/server';
import PlatformCafesPageClient from './PlatformCafesPageClient';

export const dynamic = 'force-dynamic';

export default async function PlatformCafesPage() {
  const session = await requirePlatformAdminSession();

  return (
    <PlatformChrome
      session={session}
      title="سجل القهاوي"
    >
      <PlatformCafesPageClient />
    </PlatformChrome>
  );
}
