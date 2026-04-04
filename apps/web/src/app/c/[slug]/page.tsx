import { PublicCafeOrderingClient } from './PublicCafeOrderingClient';

export default async function PublicCafeOrderingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicCafeOrderingClient slug={slug} />;
}
