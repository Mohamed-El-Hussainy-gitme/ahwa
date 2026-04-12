import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import LoginLandingClient from './LoginLandingClient';
import { normalizeRuntimeNext, resolveRuntimeHomePath } from '@/lib/runtime/auth-entry';
import { getRuntimeMe, getRuntimeResumePath } from '@/lib/runtime/server';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

function readSearchParam(searchParams: SearchParams | undefined, key: string): string | null {
  const value = searchParams?.[key];
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] ?? null : null;
}

export default async function LoginPage({ searchParams }: { searchParams?: Promise<SearchParams> | SearchParams }) {
  const resolvedSearchParams = searchParams && typeof (searchParams as Promise<SearchParams>).then === 'function'
    ? await searchParams
    : searchParams;
  const next = normalizeRuntimeNext(readSearchParam(resolvedSearchParams, 'next'));
  const me = await getRuntimeMe();
  if (me && next) {
    const resumePath = await getRuntimeResumePath();
    redirect(resumePath ?? next ?? resolveRuntimeHomePath(me));
  }
  return <Suspense fallback={<div className='min-h-dvh bg-neutral-50' />}><LoginLandingClient /></Suspense>;
}
