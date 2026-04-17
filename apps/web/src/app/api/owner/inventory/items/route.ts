import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsActorContext, requireOwnerRole } from '@/app/api/ops/_helpers';
import { cleanInventoryText, createInventoryItem, normalizeInventoryText } from '@/lib/ops/inventory';

const Input = z.object({
  itemName: z.string().min(1),
  itemCode: z.string().optional().nullable(),
  categoryLabel: z.string().optional().nullable(),
  unitLabel: z.string().min(1),
  purchaseUnitLabel: z.string().optional().nullable(),
  purchaseToStockFactor: z.coerce.number().positive().max(1_000_000).optional().nullable(),
  lowStockThreshold: z.coerce.number().min(0).max(1_000_000).optional(),
  openingBalance: z.coerce.number().min(0).max(1_000_000).optional(),
  openingBalanceEntryUnit: z.enum(['stock', 'purchase']).optional().nullable(),
  notes: z.string().optional().nullable(),
});

function mapInventoryError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
    ? String((error as { code?: string }).code)
    : error instanceof Error
      ? error.message
      : 'INVENTORY_ITEM_REQUEST_FAILED';

  if (code === '23505') {
    return { code: 'INVENTORY_ITEM_CODE_EXISTS', message: 'كود الخامة مستخدم بالفعل داخل المخزن.' };
  }

  return { code, message: code };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: { code: 'INVALID_INPUT', message: 'بيانات الخامة غير صالحة.' } }, { status: 400 });
  }

  const itemName = cleanInventoryText(parsed.data.itemName);
  const normalizedName = normalizeInventoryText(itemName ?? '');
  const unitLabel = cleanInventoryText(parsed.data.unitLabel);
  const purchaseUnitLabel = cleanInventoryText(parsed.data.purchaseUnitLabel);
  const purchaseToStockFactor = purchaseUnitLabel ? (parsed.data.purchaseToStockFactor ?? 1) : null;
  const openingBalanceEntryUnit = purchaseUnitLabel ? (parsed.data.openingBalanceEntryUnit ?? 'stock') : 'stock';

  if (!itemName || !normalizedName || !unitLabel) {
    return NextResponse.json({ ok: false, error: { code: 'INVALID_INPUT', message: 'اسم الخامة ووحدة التشغيل مطلوبان.' } }, { status: 400 });
  }

  try {
    const ctx = requireOwnerRole(await requireOpsActorContext());
    const itemId = await createInventoryItem({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      actorOwnerId: ctx.actorOwnerId,
      itemName,
      normalizedName,
      itemCode: cleanInventoryText(parsed.data.itemCode),
      categoryLabel: cleanInventoryText(parsed.data.categoryLabel),
      unitLabel,
      purchaseUnitLabel,
      purchaseToStockFactor,
      lowStockThreshold: parsed.data.lowStockThreshold ?? 0,
      openingBalance: parsed.data.openingBalance ?? 0,
      openingBalanceEntryUnit,
      notes: cleanInventoryText(parsed.data.notes),
    });
    return NextResponse.json({ ok: true, itemId });
  } catch (error) {
    const mapped = mapInventoryError(error);
    return NextResponse.json({ ok: false, error: mapped }, { status: 400 });
  }
}
