import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsActorContext, requireOwnerRole } from '@/app/api/ops/_helpers';
import { removePublicMenuProductImage } from '@/lib/public-menu-content';
import { revalidatePublicMenuForCafeId } from '@/lib/public-ordering';

const DeleteInput = z.object({
  productId: z.string().uuid(),
});

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = DeleteInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: { code: 'INVALID_INPUT', message: 'تعذر حذف الصورة بسبب بيانات غير صالحة.' } }, { status: 400 });
  }

  try {
    const ctx = requireOwnerRole(await requireOpsActorContext());
    const item = await removePublicMenuProductImage({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      actorOwnerId: ctx.actorOwnerId,
      productId: parsed.data.productId,
    });

    await revalidatePublicMenuForCafeId(ctx.cafeId);
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'PUBLIC_MENU_IMAGE_DELETE_FAILED';
    return NextResponse.json({ ok: false, error: { code, message: code } }, { status: 400 });
  }
}
