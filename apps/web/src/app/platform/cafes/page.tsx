import { PlatformChrome } from '@/app/platform/_components/PlatformChrome';
import { requirePlatformAdminSession } from '@/app/platform/_lib/server';
import PlatformCafesPageClient from './PlatformCafesPageClient';

export const dynamic = 'force-dynamic';

export default async function PlatformCafesPage() {
  const session = await requirePlatformAdminSession();

  return (
    <PlatformChrome
      session={session}
      title="سجل القهاوي" description="راجع حالة كل قهوة، ابحث سريعًا، ثم افتح التفاصيل أو إجراءات التفعيل من نفس السجل."
    >
      <PlatformCafesPageClient />
    </PlatformChrome>
  );
}
