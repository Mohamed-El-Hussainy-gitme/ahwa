import { redirect } from 'next/navigation';
import LoginClient from './LoginClient';
import { normalizeCafeSlug } from '@/lib/cafes/slug';
import { getRuntimeMe, getRuntimeResumePath } from '@/lib/runtime/server';
import { resolveRuntimeAuthRedirectTarget, sanitizeRuntimeRelativePath } from '@/lib/runtime/navigation';

export const dynamic = 'force-dynamic';

type ParamsObj = { slug: string };
type SearchParamsRecord = Record<string, string | string[] | undefined>;
type PageProps = {
  params: Promise<ParamsObj> | ParamsObj;
  searchParams?: Promise<SearchParamsRecord> | SearchParamsRecord;
};

function isPromise<T>(value: unknown): value is Promise<T> {
  return !!value && typeof (value as { then?: unknown }).then === 'function';
}

function readFirst(params: SearchParamsRecord, key: string): string | null {
  const value = params[key];
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : null;
  return typeof value === 'string' ? value : null;
}

export default async function Page({ params, searchParams }: PageProps) {
  const resolvedParams = isPromise<ParamsObj>(params) ? await params : params;
  const resolvedSearchParams = isPromise<SearchParamsRecord>(searchParams) ? await searchParams : (searchParams ?? {});
  const slug = normalizeCafeSlug(String(resolvedParams.slug ?? ''));

  if (!slug) {
    redirect('/login?e=cafe_not_found');
  }

  const me = await getRuntimeMe();
  if (me) {
    const nextPath = sanitizeRuntimeRelativePath(readFirst(resolvedSearchParams, 'next'));
    if (nextPath) {
      const resumePath = await getRuntimeResumePath();
      redirect(resolveRuntimeAuthRedirectTarget({ user: me, nextPath, resumePath }));
    }
  }

  return <LoginClient cafeSlug={slug} />;
}
