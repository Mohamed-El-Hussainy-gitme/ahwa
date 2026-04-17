import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsActorContext, requireOwnerRole } from '@/app/api/ops/_helpers';
import {
  cleanInventoryText,
  normalizeInventoryText,
  setInventoryItemActive,
  updateInventoryItem,
} from '@/lib/ops/inventory';

const Input = z.object({
  itemName: z.string().min(1).optional(),
  itemCode: z.string().optional().nullable(),
  categoryLabel: z.string().optional().nullable(),
  unitLabel: z.string().min(1).optional(),
  lowStockThreshold: z.coerce.number().min(0).max(1_000_000).optional(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

function mapInventoryError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
    ? String((error as { code?: string }).code)
    : error instanceof Error
      ? error.message
      : 'INVENTORY_ITEM_UPDATE_FAILED';

  if (code === '23505') {
    return { code: 'INVENTORY_ITEM_CODE_EXISTS', message: 'كود الخامة مستخدم بالفعل داخل المخزن.' };
  }

  return { code, message: code };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: { code: 'INVALID_INPUT', message: 'بيانات الخامة غير صالحة.' } }, { status: 400 });
  }

  try {
    const ctx = requireOwnerRole(await requireOpsActorContext());
    if (typeof parsed.data.isActive === 'boolean' && !parsed.data.itemName && !parsed.data.unitLabel) {
      await setInventoryItemActive({
        cafeId: ctx.cafeId,
        databaseKey: ctx.databaseKey,
        actorOwnerId: ctx.actorOwnerId,
        itemId,
        isActive: parsed.data.isActive,
      });
      return NextResponse.json({ ok: true });
    }

    const itemName = cleanInventoryText(parsed.data.itemName ?? '');
    const normalizedName = normalizeInventoryText(itemName ?? '');
    const unitLabel = cleanInventoryText(parsed.data.unitLabel ?? '');
    if (!itemName || !normalizedName || !unitLabel) {
      return NextResponse.json({ ok: false, error: { code: 'INVALID_INPUT', message: 'اسم الخامة ووحدة القياس مطلوبان.' } }, { status: 400 });
    }

    await updateInventoryItem({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      actorOwnerId: ctx.actorOwnerId,
      itemId,
      itemName,
      normalizedName,
      itemCode: cleanInventoryText(parsed.data.itemCode),
      categoryLabel: cleanInventoryText(parsed.data.categoryLabel),
      unitLabel,
      lowStockThreshold: parsed.data.lowStockThreshold ?? 0,
      notes: cleanInventoryText(parsed.data.notes),
      isActive: parsed.data.isActive ?? true,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const mapped = mapInventoryError(error);
    return NextResponse.json({ ok: false, error: mapped }, { status: 400 });
  }
}
