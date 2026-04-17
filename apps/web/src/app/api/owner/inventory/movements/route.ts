import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsActorContext, requireOwnerRole } from '@/app/api/ops/_helpers';
import { cleanInventoryText, recordInventoryMovement, resolveInventoryMovementEntry } from '@/lib/ops/inventory';

const Input = z.object({
  inventoryItemId: z.string().uuid(),
  movementKind: z.enum(['inbound', 'outbound', 'waste', 'adjustment']),
  quantity: z.coerce.number().positive().max(1_000_000),
  entryUnit: z.enum(['stock', 'purchase']).optional().nullable(),
  adjustmentDirection: z.enum(['increase', 'decrease']).optional(),
  supplierId: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
  occurredAt: z.string().datetime().optional().nullable(),
});

function mapInventoryError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
    ? String((error as { code?: string }).code)
    : error instanceof Error
      ? error.message
      : 'INVENTORY_MOVEMENT_FAILED';
  return { code, message: code };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: { code: 'INVALID_INPUT', message: 'بيانات الحركة غير صالحة.' } }, { status: 400 });
  }

  try {
    const ctx = requireOwnerRole(await requireOpsActorContext());
    const entryUnit = parsed.data.movementKind === 'inbound' ? (parsed.data.entryUnit ?? 'stock') : 'stock';
    const resolvedEntry = await resolveInventoryMovementEntry({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      inventoryItemId: parsed.data.inventoryItemId,
      quantity: parsed.data.quantity,
      entryUnitMode: entryUnit,
    });

    let deltaQuantity = resolvedEntry.deltaQuantity;
    if (parsed.data.movementKind === 'outbound' || parsed.data.movementKind === 'waste') {
      deltaQuantity = -Math.abs(deltaQuantity);
    }
    if (parsed.data.movementKind === 'adjustment') {
      deltaQuantity = parsed.data.adjustmentDirection === 'decrease'
        ? -Math.abs(deltaQuantity)
        : Math.abs(deltaQuantity);
    }

    const result = await recordInventoryMovement({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      actorOwnerId: ctx.actorOwnerId,
      inventoryItemId: parsed.data.inventoryItemId,
      movementKind: parsed.data.movementKind,
      deltaQuantity,
      inputQuantity: resolvedEntry.inputQuantity,
      inputUnitLabel: resolvedEntry.inputUnitLabel,
      conversionFactor: resolvedEntry.conversionFactor,
      supplierId: parsed.data.supplierId ?? null,
      notes: cleanInventoryText(parsed.data.notes),
      occurredAt: parsed.data.occurredAt ?? null,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const mapped = mapInventoryError(error);
    return NextResponse.json({ ok: false, error: mapped }, { status: 400 });
  }
}
