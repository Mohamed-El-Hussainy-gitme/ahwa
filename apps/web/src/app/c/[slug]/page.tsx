import { loadPublicMenu, PUBLIC_MENU_REVALIDATE_SECONDS } from '@/lib/public-ordering';
import { PublicCafeOrderingClient } from './PublicCafeOrderingClient';

export const revalidate = 60;

export default async function PublicCafeOrderingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const initialMenu = await loadPublicMenu(slug);

  return <PublicCafeOrderingClient slug={slug} initialMenu={initialMenu} />;
}
