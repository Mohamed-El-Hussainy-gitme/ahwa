import { NextResponse } from 'next/server';
import { setGateSlugCookie } from '@/lib/auth/cookies';
import { resolveCafeBySlug } from '@/lib/ops/cafes';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const slug = String(body.slug ?? '').trim().toLowerCase();
  if (!slug) {
    return NextResponse.json({ ok: false, error: { code: 'INVALID_SLUG', message: 'Cafe slug is required.' } }, { status: 400 });
  }

  try {
    const cafe = await resolveCafeBySlug(slug);
    if (!cafe || !cafe.isActive) {
      return NextResponse.json({ ok: false, error: { code: 'CAFE_NOT_FOUND', message: 'Cafe not found.' } }, { status: 404 });
    }

    const response = NextResponse.json({
      ok: true,
      gate: {
        tenantId: cafe.id,
        tenantSlug: cafe.slug,
        tenantName: cafe.displayName,
        deviceRequired: true,
        databaseKey: cafe.databaseKey,
      },
    });
    setGateSlugCookie(response, slug);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'CAFE_RESOLVE_FAILED';
    return NextResponse.json({ ok: false, error: { code: 'CAFE_RESOLVE_FAILED', message } }, { status: 500 });
  }
}
