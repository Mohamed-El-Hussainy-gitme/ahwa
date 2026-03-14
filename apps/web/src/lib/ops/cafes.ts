import { supabaseAdmin } from '@/lib/supabase/admin';

export type ResolvedCafe = {
  id: string;
  slug: string;
  displayName: string;
  isActive: boolean;
};

export async function resolveCafeBySlug(slug: string): Promise<ResolvedCafe | null> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;

  const { data, error } = await supabaseAdmin()
    .schema('ops')
    .from('cafes')
    .select('id, slug, display_name, is_active')
    .eq('slug', normalized)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: String(data.id),
    slug: String(data.slug),
    displayName: String(data.display_name ?? data.slug),
    isActive: !!data.is_active,
  };
}
