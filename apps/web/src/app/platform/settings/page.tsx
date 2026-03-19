import { PlatformChrome } from '@/app/platform/_components/PlatformChrome';
import { requirePlatformAdminSession } from '@/app/platform/_lib/server';
import PlatformSettingsPageClient from './PlatformSettingsPageClient';

export const dynamic = 'force-dynamic';

export default async function PlatformSettingsPage() {
  const session = await requirePlatformAdminSession();

  return (
    <PlatformChrome
      session={session}
      title="إعدادات المنصة" description="خصص سياسات السعة والشاردات بعناية، واستخدم هذه الصفحة للتغيير المدروس لا للمتابعة اليومية."
    >
      <PlatformSettingsPageClient />
    </PlatformChrome>
  );
}
