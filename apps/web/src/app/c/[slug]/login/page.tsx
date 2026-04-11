import { redirect } from 'next/navigation';
import LoginClient from './LoginClient';
import { normalizeCafeSlug } from '@/lib/cafes/slug';
import { resolveRuntimeNextPath } from '@/lib/runtime/navigation';
import { getRuntimeMe, getRuntimeResumePath } from '@/lib/runtime/server';

export const dynamic = 'force-dynamic';

type ParamsObj = { slug: string };
type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = { params: Promise<ParamsObj> | ParamsObj; searchParams?: Promise<SearchParams> | SearchParams };

function isPromise<T>(value: unknown): value is Promise<T> {
  return !!value && typeof (value as { then?: unknown }).then === 'function';
}

function getSearchParam(searchParams: SearchParams, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function Page({ params, searchParams }: PageProps) {
  const resolved = isPromise<ParamsObj>(params) ? await params : params;
  const resolvedSearchParams = isPromise<SearchParams>(searchParams) ? await searchParams : searchParams ?? {};
  const slug = normalizeCafeSlug(String(resolved.slug ?? ''));

  if (!slug) {
    redirect('/login?e=cafe_not_found');
  }

  const me = await getRuntimeMe();
  const resumePath = await getRuntimeResumePath();
  const nextPath = resolveRuntimeNextPath(getSearchParam(resolvedSearchParams, 'next'));
  if (me && nextPath) {
    redirect(resumePath ?? nextPath);
  }

  return <LoginClient cafeSlug={slug} />;
}
