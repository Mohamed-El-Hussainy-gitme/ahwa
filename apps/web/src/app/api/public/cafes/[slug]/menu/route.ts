import { NextResponse } from 'next/server';
import { loadPublicMenu } from '@/lib/public-ordering';

export const revalidate = 0;

export async function GET(_: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;

  try {
    const payload = await loadPublicMenu(slug);
    return NextResponse.json(
      { ok: true, ...payload },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0, must-revalidate',
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PUBLIC_MENU_LOAD_FAILED';
    const status = message === 'CAFE_NOT_FOUND' ? 404 : 400;
    return NextResponse.json({ ok: false, error: { code: message, message } }, { status });
  }
}