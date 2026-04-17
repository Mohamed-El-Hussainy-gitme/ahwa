import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsActorContext, requireOwnerRole } from '@/app/api/ops/_helpers';
import { applyInventoryQuickCount, cleanInventoryText } from '@/lib/ops/inventory';

const Input = z.object({
  inventoryItemId: z.string().uuid(),
  actualQuantity: z.coerce.number().positive().max(1_000_000),
  entryUnit: z.enum(['stock', 'purchase']).optional().nullable(),
  notes: z.string().optional().nullable(),
  countedAt: z.string().datetime().optional().nullable(),
});

function mapInventoryError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
    ? String((error as { code?: string }).code)
    : error instanceof Error
      ? error.message
      : 'INVENTORY_QUICK_COUNT_FAILED';
  return { code, message: code };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: { code: 'INVALID_INPUT', message: 'بيانات الجرد السريع غير صالحة.' } }, { status: 400 });
  }

  try {
    const ctx = requireOwnerRole(await requireOpsActorContext());
    const result = await applyInventoryQuickCount({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      actorOwnerId: ctx.actorOwnerId,
      inventoryItemId: parsed.data.inventoryItemId,
      actualQuantity: parsed.data.actualQuantity,
      actualEntryUnit: parsed.data.entryUnit ?? 'stock',
      notes: cleanInventoryText(parsed.data.notes),
      countedAt: parsed.data.countedAt ?? null,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const mapped = mapInventoryError(error);
    return NextResponse.json({ ok: false, error: mapped }, { status: 400 });
  }
}
