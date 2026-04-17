import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsActorContext, requireOwnerRole } from '@/app/api/ops/_helpers';
import { cleanInventoryText, createInventorySupplier, normalizeInventoryText } from '@/lib/ops/inventory';

const Input = z.object({
  supplierName: z.string().min(1),
  phone: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

function mapInventoryError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
    ? String((error as { code?: string }).code)
    : error instanceof Error
      ? error.message
      : 'INVENTORY_SUPPLIER_REQUEST_FAILED';
  return { code, message: code };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: { code: 'INVALID_INPUT', message: 'بيانات المورد غير صالحة.' } }, { status: 400 });
  }

  const supplierName = cleanInventoryText(parsed.data.supplierName);
  const normalizedName = normalizeInventoryText(supplierName ?? '');
  if (!supplierName || !normalizedName) {
    return NextResponse.json({ ok: false, error: { code: 'INVALID_INPUT', message: 'اسم المورد مطلوب.' } }, { status: 400 });
  }

  try {
    const ctx = requireOwnerRole(await requireOpsActorContext());
    const supplierId = await createInventorySupplier({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      actorOwnerId: ctx.actorOwnerId,
      supplierName,
      normalizedName,
      phone: cleanInventoryText(parsed.data.phone),
      notes: cleanInventoryText(parsed.data.notes),
    });
    return NextResponse.json({ ok: true, supplierId });
  } catch (error) {
    const mapped = mapInventoryError(error);
    return NextResponse.json({ ok: false, error: mapped }, { status: 400 });
  }
}
