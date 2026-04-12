import { redirect } from 'next/navigation';
import LoginClient from './LoginClient';
import { normalizeCafeSlug } from '@/lib/cafes/slug';
import { normalizeRuntimeNext, resolveRuntimeHomePath } from '@/lib/runtime/auth-entry';
import { getRuntimeMe, getRuntimeResumePath } from '@/lib/runtime/server';

export const dynamic = 'force-dynamic';

type ParamsObj = { slug: string };
type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = { params: Promise<ParamsObj> | ParamsObj; searchParams?: Promise<SearchParams> | SearchParams };

function isPromise<T>(value: unknown): value is Promise<T> {
  return !!value && typeof (value as { then?: unknown }).then === 'function';
}

function readSearchParam(searchParams: SearchParams | undefined, key: string): string | null {
  const value = searchParams?.[key];
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] ?? null : null;
}

export default async function Page({ params, searchParams }: PageProps) {
  const resolved = isPromise<ParamsObj>(params) ? await params : params;
  const resolvedSearchParams = isPromise<SearchParams>(searchParams) ? await searchParams : searchParams;
  const slug = normalizeCafeSlug(String(resolved.slug ?? ''));

  if (!slug) {
    redirect('/login?e=cafe_not_found');
  }

  const next = normalizeRuntimeNext(readSearchParam(resolvedSearchParams, 'next'));
  const me = await getRuntimeMe();
  if (me && next) {
    const resumePath = await getRuntimeResumePath();
    redirect(resumePath ?? next ?? resolveRuntimeHomePath(me));
  }

  return <LoginClient cafeSlug={slug} />;
}
