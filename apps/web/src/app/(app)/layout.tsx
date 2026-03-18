import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import ClientProviders from './ClientProviders';
import { getRuntimeMe } from '@/lib/runtime/server';
import { decodePlatformAdminSession, PLATFORM_ADMIN_COOKIE } from '@/lib/platform-auth/session';

export const dynamic = 'force-dynamic';

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getRuntimeMe();
  if (!me) {
    const jar = await cookies();
    const platformSession = decodePlatformAdminSession(jar.get(PLATFORM_ADMIN_COOKIE)?.value);
    redirect(platformSession ? '/platform/support' : '/login');
  }

  const baseRole: 'owner' | 'staff' = me.accountKind === 'owner' ? 'owner' : 'staff';

  const user = {
    id: me.userId,
    cafeId: me.tenantId,
    name: me.fullName,
    baseRole,
  };

  return (
    <>
      {me.supportAccess ? (
        <div className="bg-indigo-950 px-3 py-3 text-white" dir="rtl">
          <div className="mx-auto flex max-w-md flex-col gap-3 md:max-w-3xl md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-bold">أنت داخل القهوة الآن بوصول دعم مؤقت</div>
              <div className="mt-1 text-xs text-indigo-100">
                هذه الجلسة تعمل بصلاحيات المعلم مؤقتًا حتى انتهاء الوقت أو إغلاق البلاغ. ينتهي الوصول عند {formatDateTime(me.supportAccess.expiresAt)}.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/platform/support/access/${me.supportAccess.messageId}`} className="rounded-2xl border border-indigo-300/50 bg-white/10 px-4 py-2 text-sm font-semibold text-white">
                ملخص الدعم
              </Link>
              <Link href={`/api/platform/support/access/exit?messageId=${me.supportAccess.messageId}`} className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-indigo-900">
                الخروج والعودة للدعم
              </Link>
            </div>
          </div>
        </div>
      ) : null}
      <ClientProviders user={user}>{children}</ClientProviders>
    </>
  );
}
