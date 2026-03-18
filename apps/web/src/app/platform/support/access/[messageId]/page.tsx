import Link from 'next/link';
import { PlatformChrome } from '@/app/platform/_components/PlatformChrome';
import { requirePlatformAdminSession } from '@/app/platform/_lib/server';
import PlatformSupportAccessWorkspaceClient from './PlatformSupportAccessWorkspaceClient';

export const dynamic = 'force-dynamic';

export default async function PlatformSupportAccessPage({
  params,
}: {
  params: Promise<{ messageId: string }>;
}) {
  const [{ messageId }, session] = await Promise.all([params, requirePlatformAdminSession()]);

  return (
    <PlatformChrome session={session} title="مساحة دعم القهوة">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Link href="/platform/support" className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700">العودة إلى صندوق الدعم</Link>
        </div>
        <PlatformSupportAccessWorkspaceClient messageId={messageId} />
      </div>
    </PlatformChrome>
  );
}
