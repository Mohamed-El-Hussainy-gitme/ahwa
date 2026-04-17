import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsActorContext, requireOwnerRole } from '@/app/api/ops/_helpers';
import { cleanInventoryText, upsertInventoryAddonRecipesBulk } from '@/lib/ops/inventory';

const Row = z.object({
  menuAddonId: z.string().uuid().optional().nullable(),
  quantityPerUnit: z.coerce.number().min(0).max(1_000_000),
  wastagePercent: z.coerce.number().min(0).max(500).optional().nullable(),
  notes: z.string().optional().nullable(),
});

const Input = z.object({
  inventoryItemId: z.string().uuid(),
  rows: z.array(Row).min(1).max(20),
});

function mapInventoryError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
    ? String((error as { code?: string }).code)
    : error instanceof Error
      ? error.message
      : 'INVENTORY_ADDON_BULK_FAILED';
  return { code, message: code };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: { code: 'INVALID_INPUT', message: 'بيانات الخيارات المنظمة غير صالحة.' } }, { status: 400 });
  }

  try {
    const ctx = requireOwnerRole(await requireOpsActorContext());
    const result = await upsertInventoryAddonRecipesBulk({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      actorOwnerId: ctx.actorOwnerId,
      inventoryItemId: parsed.data.inventoryItemId,
      rows: parsed.data.rows.map((row) => ({
        menuAddonId: row.menuAddonId ? String(row.menuAddonId) : '',
        quantityPerUnit: row.quantityPerUnit,
        wastagePercent: row.wastagePercent ?? 0,
        notes: cleanInventoryText(row.notes),
      })),
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const mapped = mapInventoryError(error);
    return NextResponse.json({ ok: false, error: mapped }, { status: 400 });
  }
}
