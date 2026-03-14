import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { decodePlatformAdminSession, PLATFORM_ADMIN_COOKIE } from '@/lib/platform-auth/session';
import PlatformCafeDetailClient from './PlatformCafeDetailClient';

export const dynamic = 'force-dynamic';

export default async function PlatformCafeDetailPage({
  params,
}: {
  params: Promise<{ cafeId: string }>;
}) {
  const [{ cafeId }, jar] = await Promise.all([params, cookies()]);
  const session = decodePlatformAdminSession(jar.get(PLATFORM_ADMIN_COOKIE)?.value);
  if (!session) redirect('/platform/login');

  return (
    <div className="min-h-screen bg-slate-100 p-6" dir="rtl">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">تفاصيل القهوة</h1>
            <p className="mt-1 text-sm text-slate-500">الحساب، الاشتراك، الاستخدام، صحة التشغيل، وإجراءات الدعم من مكان واحد.</p>
          </div>
          <Link href="/platform" className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700">
            رجوع إلى لوحة المنصة
          </Link>
        </div>
        <PlatformCafeDetailClient cafeId={cafeId} />
      </div>
    </div>
  );
}
