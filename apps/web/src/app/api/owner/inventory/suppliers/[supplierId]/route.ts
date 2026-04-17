import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsActorContext, requireOwnerRole } from '@/app/api/ops/_helpers';
import {
  cleanInventoryText,
  normalizeInventoryText,
  setInventorySupplierActive,
  updateInventorySupplier,
} from '@/lib/ops/inventory';

const Input = z.object({
  supplierName: z.string().min(1).optional(),
  phone: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

function mapInventoryError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
    ? String((error as { code?: string }).code)
    : error instanceof Error
      ? error.message
      : 'INVENTORY_SUPPLIER_UPDATE_FAILED';
  return { code, message: code };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ supplierId: string }> }) {
  const { supplierId } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: { code: 'INVALID_INPUT', message: 'بيانات المورد غير صالحة.' } }, { status: 400 });
  }

  try {
    const ctx = requireOwnerRole(await requireOpsActorContext());
    if (typeof parsed.data.isActive === 'boolean' && !parsed.data.supplierName) {
      await setInventorySupplierActive({
        cafeId: ctx.cafeId,
        databaseKey: ctx.databaseKey,
        actorOwnerId: ctx.actorOwnerId,
        supplierId,
        isActive: parsed.data.isActive,
      });
      return NextResponse.json({ ok: true });
    }

    const supplierName = cleanInventoryText(parsed.data.supplierName ?? '');
    const normalizedName = normalizeInventoryText(supplierName ?? '');
    if (!supplierName || !normalizedName) {
      return NextResponse.json({ ok: false, error: { code: 'INVALID_INPUT', message: 'اسم المورد مطلوب.' } }, { status: 400 });
    }

    await updateInventorySupplier({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      actorOwnerId: ctx.actorOwnerId,
      supplierId,
      supplierName,
      normalizedName,
      phone: cleanInventoryText(parsed.data.phone),
      notes: cleanInventoryText(parsed.data.notes),
      isActive: parsed.data.isActive ?? true,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const mapped = mapInventoryError(error);
    return NextResponse.json({ ok: false, error: mapped }, { status: 400 });
  }
}
