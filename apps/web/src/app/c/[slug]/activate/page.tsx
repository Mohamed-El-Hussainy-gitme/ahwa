import ActivateClient from './ActivateClient';
import { normalizeCafeSlugForLookup } from '@/lib/cafes/slug';

export const dynamic = 'force-dynamic';

type ParamsObj = { slug: string };
type PageProps = { params: Promise<ParamsObj> | ParamsObj };
function isPromise<T>(v: unknown): v is Promise<T> {
  return !!v && typeof (v as { then?: unknown }).then === 'function';
}
export default async function Page({ params }: PageProps) {
  const resolved = isPromise<ParamsObj>(params) ? await params : params;
  return <ActivateClient cafeSlug={normalizeCafeSlugForLookup(String(resolved.slug ?? ''))} />;
}
