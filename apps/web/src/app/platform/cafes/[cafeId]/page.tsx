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
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-slate-900">تفاصيل القهوة</h1>
          <p className="mt-1 text-sm text-slate-500">ملف إداري مرتب للقهوة: الملخص، الملاك، الاشتراك، وسجل الدعم الفني بدون تكرار أو ازدحام.</p>
        </div>
        <PlatformCafeDetailClient cafeId={cafeId} />
      </div>
    </div>
  );
}
