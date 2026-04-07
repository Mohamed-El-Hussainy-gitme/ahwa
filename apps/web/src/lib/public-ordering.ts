import { resolveCafeBindingBySlug } from '@/lib/control-plane/cafes';
import { adminOps, buildMenuWorkspace } from '@/app/api/ops/_server';
import { requireOpenOpsShift } from '@/app/api/ops/_helpers';

export type PublicCafeContext = {
  cafeId: string;
  cafeSlug: string;
  cafeName: string;
  databaseKey: string;
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

export async function loadPublicMenu(slug: string) {
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
