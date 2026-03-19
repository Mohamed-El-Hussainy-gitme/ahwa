import Link from 'next/link';
import { PlatformChrome } from '@/app/platform/_components/PlatformChrome';
import { requirePlatformAdminSession } from '@/app/platform/_lib/server';
import PlatformCafeDetailClient from './PlatformCafeDetailClient';

export const dynamic = 'force-dynamic';

export default async function PlatformCafeDetailPage({
  params,
}: {
  params: Promise<{ cafeId: string }>;
}) {
  const [{ cafeId }, session] = await Promise.all([params, requirePlatformAdminSession()]);

  return (
    <PlatformChrome
      session={session}
      title="تفاصيل القهوة" description="راجع الملاك، الاشتراك، التفعيل، وربط قاعدة التشغيل ثم اتخذ الإجراء المطلوب."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Link href="/platform/cafes" className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700">العودة إلى سجل القهاوي</Link>
          <Link href="/platform/cafes/new" className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700">إنشاء قهوة جديدة</Link>
        </div>
        <PlatformCafeDetailClient cafeId={cafeId} />
      </div>
    </PlatformChrome>
  );
}
