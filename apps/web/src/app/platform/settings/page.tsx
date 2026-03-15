import { PlatformChrome } from '@/app/platform/_components/PlatformChrome';
import { requirePlatformAdminSession } from '@/app/platform/_lib/server';
import PlatformSettingsPageClient from './PlatformSettingsPageClient';

export const dynamic = 'force-dynamic';

export default async function PlatformSettingsPage() {
  const session = await requirePlatformAdminSession();

  return (
    <PlatformChrome
      session={session}
      title="إعدادات المنصة"
    >
      <PlatformSettingsPageClient />
    </PlatformChrome>
  );
}
