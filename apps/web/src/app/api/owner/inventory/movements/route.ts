import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsActorContext, requireOwnerRole } from '@/app/api/ops/_helpers';
import { cleanInventoryText, recordInventoryMovement } from '@/lib/ops/inventory';

const Input = z.object({
  inventoryItemId: z.string().uuid(),
  movementKind: z.enum(['inbound', 'outbound', 'waste', 'adjustment']),
  quantity: z.coerce.number().positive().max(1_000_000),
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

  let deltaQuantity = parsed.data.quantity;
  if (parsed.data.movementKind === 'outbound' || parsed.data.movementKind === 'waste') {
    deltaQuantity = -Math.abs(parsed.data.quantity);
  }
  if (parsed.data.movementKind === 'adjustment') {
    deltaQuantity = parsed.data.adjustmentDirection === 'decrease'
      ? -Math.abs(parsed.data.quantity)
      : Math.abs(parsed.data.quantity);
  }

  try {
    const ctx = requireOwnerRole(await requireOpsActorContext());
    const result = await recordInventoryMovement({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      actorOwnerId: ctx.actorOwnerId,
      inventoryItemId: parsed.data.inventoryItemId,
      movementKind: parsed.data.movementKind,
      deltaQuantity,
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
