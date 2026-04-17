import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsActorContext, requireOwnerRole } from '@/app/api/ops/_helpers';
import { buildMenuWorkspace } from '@/app/api/ops/_server';
import {
  listPublicMenuProductContent,
  normalizePublicMenuDescription,
  normalizePublicMenuImageAlt,
  savePublicMenuProductMetadata,
} from '@/lib/public-menu-content';
import { revalidatePublicMenuForCafeId } from '@/lib/public-ordering';

const SaveInput = z.object({
  productId: z.string().uuid(),
  publicDescription: z.string().max(320).optional().nullable(),
  imageAlt: z.string().max(160).optional().nullable(),
});

async function buildWorkspace(cafeId: string, databaseKey: string) {
  const workspace = await buildMenuWorkspace(cafeId, databaseKey);
  const contentItems = await listPublicMenuProductContent(cafeId, databaseKey, workspace.products.map((product) => product.id));
  const contentByProductId = new Map(contentItems.map((item) => [item.productId, item]));

  return {
    sections: workspace.sections,
    products: workspace.products.map((product) => {
      const content = contentByProductId.get(product.id);
      return {
        ...product,
        publicDescription: content?.publicDescription ?? null,
        publicImageUrl: content?.imageUrl ?? null,
        publicImageAlt: content?.imageAlt ?? null,
      };
    }),
  };
}

export async function GET() {
  try {
    const ctx = requireOwnerRole(await requireOpsActorContext());
    const workspace = await buildWorkspace(ctx.cafeId, ctx.databaseKey);
    return NextResponse.json({ ok: true, ...workspace });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'PUBLIC_MENU_CONTENT_LOAD_FAILED';
    return NextResponse.json({ ok: false, error: { code, message: code } }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = SaveInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: { code: 'INVALID_INPUT', message: 'البيانات المدخلة غير صالحة.' } }, { status: 400 });
  }

  try {
    const ctx = requireOwnerRole(await requireOpsActorContext());
    const item = await savePublicMenuProductMetadata({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      actorOwnerId: ctx.actorOwnerId,
      productId: parsed.data.productId,
      publicDescription: normalizePublicMenuDescription(parsed.data.publicDescription),
      imageAlt: normalizePublicMenuImageAlt(parsed.data.imageAlt),
    });

    await revalidatePublicMenuForCafeId(ctx.cafeId);
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'PUBLIC_MENU_CONTENT_SAVE_FAILED';
    return NextResponse.json({ ok: false, error: { code, message: code } }, { status: 400 });
  }
}
