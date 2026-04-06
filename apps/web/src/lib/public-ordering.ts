import { unstable_cache } from 'next/cache';
import { resolveCafeBindingBySlug } from '@/lib/control-plane/cafes';
import { adminOps, buildMenuWorkspace } from '@/app/api/ops/_server';
import { requireOpenOpsShift } from '@/app/api/ops/_helpers';

export const PUBLIC_MENU_REVALIDATE_SECONDS = 60;
const PUBLIC_ORDER_OWNER_CACHE_TTL_MS = 60_000;


export type PublicCafeContext = {
  cafeId: string;
  cafeSlug: string;
  cafeName: string;
  databaseKey: string;
};

export type PublicMenuPayload = {
  cafe: PublicCafeContext;
  menu: {
    sections: Awaited<ReturnType<typeof buildMenuWorkspace>>['sections'];
    products: Awaited<ReturnType<typeof buildMenuWorkspace>>['products'];
    billingSettings: Awaited<ReturnType<typeof buildMenuWorkspace>>['billingSettings'];
  };
};

export async function resolvePublicCafeContext(slug: string): Promise<PublicCafeContext> {
  const binding = await resolveCafeBindingBySlug(slug);
  if (!binding || !binding.isActive) {
    throw new Error('CAFE_NOT_FOUND');
  }

  return {
    cafeId: binding.id,
    cafeSlug: binding.slug,
    cafeName: binding.displayName,
    databaseKey: binding.databaseKey,
  };
}

async function loadPublicMenuUncached(slug: string): Promise<PublicMenuPayload> {
  const cafe = await resolvePublicCafeContext(slug);
  const workspace = await buildMenuWorkspace(cafe.cafeId, cafe.databaseKey);

  return {
    cafe,
    menu: {
      sections: workspace.sections.filter((section) => section.isActive !== false),
      products: workspace.products.filter((product) => product.isActive !== false),
      billingSettings: workspace.billingSettings,
    },
  };
}

export async function loadPublicMenu(slug: string): Promise<PublicMenuPayload> {
  const cachedLoader = unstable_cache(
    async () => loadPublicMenuUncached(slug),
    ['public-menu', slug],
    {
      revalidate: PUBLIC_MENU_REVALIDATE_SECONDS,
      tags: [`public-menu:${slug}`],
    },
  );

  return cachedLoader();
}

type PublicOwnerActor = {
  ownerId: string;
  fullName: string;
  ownerName: string;
};

type PublicOwnerActorCacheEntry = {
  value: PublicOwnerActor;
  expiresAt: number;
};

const publicOwnerActorCache = new Map<string, PublicOwnerActorCacheEntry>();
const publicOwnerActorInflight = new Map<string, Promise<PublicOwnerActor>>();

function buildPublicOwnerActorCacheKey(cafeId: string, databaseKey: string) {
  return `${databaseKey}:${cafeId}`;
}

export async function requirePublicOrderingContext(slug: string) {
  const cafe = await resolvePublicCafeContext(slug);
  const [shift, owner] = await Promise.all([
    requireOpenOpsShift(cafe.cafeId, cafe.databaseKey),
    resolveFallbackOwnerActor(cafe.cafeId, cafe.databaseKey),
  ]);
  return { cafe, shift, owner };
}

export async function resolveFallbackOwnerActor(cafeId: string, databaseKey: string): Promise<PublicOwnerActor> {
  const cacheKey = buildPublicOwnerActorCacheKey(cafeId, databaseKey);
  const now = Date.now();
  const cached = publicOwnerActorCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const existingInflight = publicOwnerActorInflight.get(cacheKey);
  if (existingInflight) {
    return existingInflight;
  }

  const loadPromise = (async () => {
    const { data, error } = await adminOps(databaseKey)
      .from('owner_users')
      .select('id, full_name, is_active')
      .eq('cafe_id', cafeId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const ownerId = String(data?.id ?? '').trim();
    if (!ownerId) {
      throw new Error('PUBLIC_ORDER_OWNER_NOT_FOUND');
    }

    const fullName = String(data?.full_name ?? '').trim() || 'QR Customer';
    const resolved = {
      ownerId,
      fullName,
      ownerName: fullName,
    } satisfies PublicOwnerActor;

    publicOwnerActorCache.set(cacheKey, {
      value: resolved,
      expiresAt: Date.now() + PUBLIC_ORDER_OWNER_CACHE_TTL_MS,
    });

    return resolved;
  })();

  publicOwnerActorInflight.set(cacheKey, loadPromise);

  try {
    return await loadPromise;
  } finally {
    publicOwnerActorInflight.delete(cacheKey);
  }
}
