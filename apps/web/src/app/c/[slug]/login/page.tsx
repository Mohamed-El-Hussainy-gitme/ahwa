import { redirect } from 'next/navigation';
import LoginClient from './LoginClient';
import { normalizeCafeSlug } from '@/lib/cafes/slug';
import { getRuntimeMe, getRuntimeResumePath } from '@/lib/runtime/server';

export const dynamic = 'force-dynamic';

type ParamsObj = { slug: string };
type PageProps = { params: Promise<ParamsObj> | ParamsObj };

function isPromise<T>(value: unknown): value is Promise<T> {
  return !!value && typeof (value as { then?: unknown }).then === 'function';
}

export default async function Page({ params }: PageProps) {
  const resolved = isPromise<ParamsObj>(params) ? await params : params;
  const slug = normalizeCafeSlug(String(resolved.slug ?? ''));

  if (!slug) {
    redirect('/login?e=cafe_not_found');
  }

  const me = await getRuntimeMe();
  const resumePath = await getRuntimeResumePath();
  if (me) {
    if (resumePath) redirect(resumePath);
    if (me.accountKind === 'owner' || me.shiftRole === 'supervisor') redirect('/dashboard');
    if (me.shiftRole === 'barista') redirect('/kitchen');
    if (me.shiftRole === 'shisha') redirect('/shisha');
    redirect('/orders');
  }

  return <LoginClient cafeSlug={slug} />;
}
