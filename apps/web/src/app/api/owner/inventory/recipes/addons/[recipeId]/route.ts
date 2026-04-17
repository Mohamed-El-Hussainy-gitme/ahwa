import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsActorContext, requireOwnerRole } from '@/app/api/ops/_helpers';
import { cleanInventoryText, updateInventoryAddonRecipe } from '@/lib/ops/inventory';

const Input = z.object({
  quantityPerUnit: z.coerce.number().positive().max(1_000_000).optional(),
  wastagePercent: z.coerce.number().min(0).max(500).optional(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

function mapInventoryError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
    ? String((error as { code?: string }).code)
    : error instanceof Error
      ? error.message
      : 'INVENTORY_ADDON_RECIPE_UPDATE_FAILED';
  return { code, message: code };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ recipeId: string }> }) {
  const { recipeId } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: { code: 'INVALID_INPUT', message: 'بيانات وصفة الإضافة غير صالحة.' } }, { status: 400 });
  }
  if (typeof parsed.data.isActive === 'undefined' && typeof parsed.data.quantityPerUnit === 'undefined') {
    return NextResponse.json({ ok: false, error: { code: 'INVALID_INPUT', message: 'الكمية مطلوبة لتحديث الوصفة.' } }, { status: 400 });
  }

  try {
    const ctx = requireOwnerRole(await requireOpsActorContext());
    await updateInventoryAddonRecipe({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      actorOwnerId: ctx.actorOwnerId,
      recipeId,
      quantityPerUnit: parsed.data.quantityPerUnit ?? 0.001,
      wastagePercent: parsed.data.wastagePercent ?? 0,
      notes: cleanInventoryText(parsed.data.notes),
      isActive: parsed.data.isActive,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const mapped = mapInventoryError(error);
    return NextResponse.json({ ok: false, error: mapped }, { status: 400 });
  }
}
