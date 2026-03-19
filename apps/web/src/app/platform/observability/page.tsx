import { PlatformChrome } from '@/app/platform/_components/PlatformChrome';
import { requirePlatformAdminSession } from '@/app/platform/_lib/server';
import PlatformObservabilityPageClient from './PlatformObservabilityPageClient';

export const dynamic = 'force-dynamic';

export default async function PlatformObservabilityPage() {
  const session = await requirePlatformAdminSession();

  return (
    <PlatformChrome session={session} title="مراقبة التشغيل" description="راقب المؤشرات الشاذة وسعة التشغيل وصحة القواعد قبل اتخاذ أي إجراء على المحفظة.">
      <PlatformObservabilityPageClient />
    </PlatformChrome>
  );
}
