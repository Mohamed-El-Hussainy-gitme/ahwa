import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import LoginClient from './LoginClient';
import { resolveCafeBySlug } from '@/lib/ops/cafes';

export const dynamic = 'force-dynamic';

type ParamsObj = { slug: string };
type PageProps = { params: Promise<ParamsObj> | ParamsObj };

function isPromise<T>(v: unknown): v is Promise<T> {
  return !!v && typeof (v as { then?: unknown }).then === 'function';
}

export default async function Page({ params }: PageProps) {
  const resolved = isPromise<ParamsObj>(params) ? await params : params;
  const slug = String(resolved.slug ?? '').trim().toLowerCase();
  if (!slug) redirect('/login?e=cafe_not_found');

  let cafe = null;

  try {
    cafe = await resolveCafeBySlug(slug);
  } catch {
    redirect('/login?e=cafe_not_found');
  }

  if (!cafe || !cafe.isActive) {
    redirect('/login?e=cafe_not_found');
  }

  return (
    <Suspense fallback={<div className="min-h-dvh bg-neutral-50" />}>
      <LoginClient cafeSlug={slug} />
    </Suspense>
  );
}
