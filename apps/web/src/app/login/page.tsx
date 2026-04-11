import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import LoginLandingClient from './LoginLandingClient';
import { getRuntimeMe, getRuntimeResumePath } from '@/lib/runtime/server';
import { resolveRuntimeAuthRedirectTarget, sanitizeRuntimeRelativePath } from '@/lib/runtime/navigation';

export const dynamic = 'force-dynamic';

type SearchParamsRecord = Record<string, string | string[] | undefined>;
type PageProps = {
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

export default async function LoginPage({ searchParams }: PageProps) {
  const resolvedSearchParams = isPromise<SearchParamsRecord>(searchParams) ? await searchParams : (searchParams ?? {});
  const me = await getRuntimeMe();

  if (me) {
    const nextPath = sanitizeRuntimeRelativePath(readFirst(resolvedSearchParams, 'next'));
    if (nextPath) {
      const resumePath = await getRuntimeResumePath();
      redirect(resolveRuntimeAuthRedirectTarget({ user: me, nextPath, resumePath }));
    }
  }

  return <Suspense fallback={<div className='min-h-dvh bg-neutral-50' />}><LoginLandingClient /></Suspense>;
}
