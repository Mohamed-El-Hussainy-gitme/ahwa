import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import OwnerLoginClient from './OwnerLoginClient';
import { resolveRuntimeNextPath, getDefaultRuntimeHome } from '@/lib/runtime/navigation';
import { getRuntimeMe, getRuntimeResumePath } from '@/lib/runtime/server';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = { searchParams?: Promise<SearchParams> | SearchParams };

function isPromise<T>(value: unknown): value is Promise<T> {
  return !!value && typeof (value as { then?: unknown }).then === 'function';
}

function getSearchParam(searchParams: SearchParams, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function OwnerLoginPage({ searchParams }: PageProps) {
  const resolvedSearchParams = isPromise<SearchParams>(searchParams) ? await searchParams : searchParams ?? {};
  const me = await getRuntimeMe();
  const resumePath = await getRuntimeResumePath();
  const nextPath = resolveRuntimeNextPath(getSearchParam(resolvedSearchParams, 'next'));

  if (me && nextPath) {
    redirect(resumePath ?? nextPath);
  }

  return <Suspense fallback={<div className='min-h-dvh bg-neutral-50' />}><OwnerLoginClient defaultRuntimeHome={getDefaultRuntimeHome(me ?? undefined)} /></Suspense>;
}
