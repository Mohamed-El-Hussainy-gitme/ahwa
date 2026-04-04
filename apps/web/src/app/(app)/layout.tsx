import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import ClientProviders from './ClientProviders';
import { getRuntimeMe } from '@/lib/runtime/server';
import { decodePlatformAdminSession, PLATFORM_ADMIN_COOKIE } from '@/lib/platform-auth/session';
import { controlPlaneAdmin } from '@/lib/control-plane/admin';

export const dynamic = 'force-dynamic';


async function loadCafeDisplayName(cafeId: string, fallbackSlug: string) {
  try {
    const { data, error } = await controlPlaneAdmin()
      .schema('ops')
      .from('cafes')
      .select('display_name, slug')
      .eq('id', cafeId)
      .maybeSingle<{ display_name: string | null; slug: string | null }>();

    if (error) {
      throw error;
    }

    const displayName = String(data?.display_name ?? '').trim();
    if (displayName) {
      return displayName;
    }

    const slug = String(data?.slug ?? '').trim();
    if (slug) {
      return slug;
    }
  } catch {
    // Fall back to the tenant slug already present in the runtime session.
  }

  return fallbackSlug;
}

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
  const runtimeMe = await getRuntimeMe();
  if (!runtimeMe) {
    const jar = await cookies();
    const platformSession = decodePlatformAdminSession(jar.get(PLATFORM_ADMIN_COOKIE)?.value);
    redirect(platformSession ? '/platform/support' : '/login');
  }

  const me = runtimeMe;
  const baseRole: 'owner' | 'staff' = me.accountKind === 'owner' ? 'owner' : 'staff';
  const cafeName = await loadCafeDisplayName(me.tenantId, me.tenantSlug);

  const user = {
    id: me.userId,
    cafeId: me.tenantId,
    cafeName,
    cafeSlug: me.tenantSlug,
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
                هذه الجلسة تعمل بصلاحيات المالك مؤقتًا حتى انتهاء الوقت أو إغلاق البلاغ. ينتهي الوصول عند {formatDateTime(me.supportAccess.expiresAt)}.
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
