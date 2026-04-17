import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsActorContext, requireOwnerRole } from '@/app/api/ops/_helpers';
import { cleanInventoryText, createInventoryProductRecipe } from '@/lib/ops/inventory';

const Input = z.object({
  menuProductId: z.string().uuid(),
  inventoryItemId: z.string().uuid(),
  quantityPerUnit: z.coerce.number().positive().max(1_000_000),
  wastagePercent: z.coerce.number().min(0).max(500).optional(),
  notes: z.string().optional().nullable(),
});

function mapInventoryError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
    ? String((error as { code?: string }).code)
    : error instanceof Error
      ? error.message
      : 'INVENTORY_PRODUCT_RECIPE_CREATE_FAILED';

  if (code === '23505') {
    return { code: 'INVENTORY_PRODUCT_RECIPE_EXISTS', message: 'هذه الوصفة مرتبطة بالفعل بهذا المنتج.' };
  }

  return { code, message: code };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: { code: 'INVALID_INPUT', message: 'بيانات وصفة المنتج غير صالحة.' } }, { status: 400 });
  }

  try {
    const ctx = requireOwnerRole(await requireOpsActorContext());
    const recipeId = await createInventoryProductRecipe({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      actorOwnerId: ctx.actorOwnerId,
      menuProductId: parsed.data.menuProductId,
      inventoryItemId: parsed.data.inventoryItemId,
      quantityPerUnit: parsed.data.quantityPerUnit,
      wastagePercent: parsed.data.wastagePercent ?? 0,
      notes: cleanInventoryText(parsed.data.notes),
    });
    return NextResponse.json({ ok: true, recipeId });
  } catch (error) {
    const mapped = mapInventoryError(error);
    return NextResponse.json({ ok: false, error: mapped }, { status: 400 });
  }
}
