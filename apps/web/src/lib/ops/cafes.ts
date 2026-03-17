import { resolveCafeOperationalRouteBySlug } from '@/lib/control-plane/server';

export type ResolvedCafe = {
  id: string;
  slug: string;
  displayName: string;
  isActive: boolean;
  databaseKey: string;
  databaseStatus: string | null;
  bindingSource: 'binding' | 'default-fallback';
};

export async function resolveCafeBySlug(slug: string): Promise<ResolvedCafe | null> {
  const route = await resolveCafeOperationalRouteBySlug(slug);
  if (!route) return null;

  return {
    id: route.cafeId,
    slug: route.cafeSlug,
    displayName: route.cafeDisplayName,
    isActive: route.cafeIsActive,
    databaseKey: route.databaseKey,
    databaseStatus: route.databaseStatus,
    bindingSource: route.bindingSource,
  };
}
