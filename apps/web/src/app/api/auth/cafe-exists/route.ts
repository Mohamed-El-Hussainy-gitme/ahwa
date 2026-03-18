import { NextResponse } from 'next/server';
import { setGateSlugCookie } from '@/lib/auth/cookies';
import { resolveCafeBySlug } from '@/lib/ops/cafes';
import { normalizeCafeSlugForLookup } from '@/lib/cafes/slug';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = normalizeCafeSlugForLookup(url.searchParams.get('slug'));
  if (!slug) {
    return NextResponse.json({ ok: false, error: 'INVALID_SLUG' }, { status: 400 });
  }

  try {
    const cafe = await resolveCafeBySlug(slug);
    if (!cafe || !cafe.isActive) {
      return NextResponse.json({ ok: true, exists: false, error: 'CAFE_NOT_FOUND' });
    }

    const response = NextResponse.json({
      ok: true,
      exists: true,
      gate: {
        tenantId: cafe.id,
        tenantSlug: cafe.slug,
        tenantName: cafe.displayName,
        deviceRequired: true,
      },
    });
    setGateSlugCookie(response, slug);
    return response;
  } catch {
    return NextResponse.json({ ok: false, error: 'CHECK_FAILED' }, { status: 500 });
  }
}
