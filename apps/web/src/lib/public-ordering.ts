import 'server-only';
import { revalidateTag, unstable_cache } from 'next/cache';
import { resolveCafeBindingBySlug, resolveCafeByIdFromControlPlane } from '@/lib/control-plane/cafes';
import { adminOps, buildMenuWorkspace } from '@/app/api/ops/_server';
import { requireOpenOpsShift } from '@/app/api/ops/_helpers';

export const PUBLIC_MENU_REVALIDATE_SECONDS = 60;

export function buildPublicMenuTag(slug: string) {
  return `public-menu:${slug.trim().toLowerCase()}`;
}

export async function revalidatePublicMenuForCafeId(cafeId: string): Promise<void> {
  const cafe = await resolveCafeByIdFromControlPlane(cafeId);
  const slug = cafe?.slug?.trim();
  if (!slug) return;
  revalidateTag(buildPublicMenuTag(slug), 'max');
}

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
    addons: Awaited<ReturnType<typeof buildMenuWorkspace>>['addons'];
    productAddonLinks: Awaited<ReturnType<typeof buildMenuWorkspace>>['productAddonLinks'];
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
      addons: workspace.addons.filter((addon) => addon.isActive !== false),
      productAddonLinks: workspace.productAddonLinks,
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
      tags: [buildPublicMenuTag(slug)],
    },
  );

  return cachedLoader();
}

export async function requirePublicOrderingContext(slug: string) {
  const cafe = await resolvePublicCafeContext(slug);
  const shift = await requireOpenOpsShift(cafe.cafeId, cafe.databaseKey);
  return { cafe, shift };
}

export async function resolveFallbackOwnerActor(cafeId: string, databaseKey: string) {
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

  return {
    ownerId,
    ownerName: String(data?.full_name ?? '').trim() || 'QR Customer',
  };
}
