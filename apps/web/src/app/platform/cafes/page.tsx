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
      description="صفحة مستقلة للبحث في القهاوي، إدارة تفعيلها، ومتابعة الحالات القريبة بدل ازدحام كل شيء داخل شاشة واحدة."
    >
      <PlatformCafesPageClient />
    </PlatformChrome>
  );
}
