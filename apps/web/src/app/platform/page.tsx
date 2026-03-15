import { redirect } from 'next/navigation';
import { requirePlatformAdminSession } from '@/app/platform/_lib/server';

export const dynamic = 'force-dynamic';

export default async function PlatformPage() {
  await requirePlatformAdminSession();
  redirect('/platform/overview');
}
