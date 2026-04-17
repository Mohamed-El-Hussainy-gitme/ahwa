import { NextResponse } from 'next/server';
import { requireOpsActorContext, requireOwnerRole } from '@/app/api/ops/_helpers';
import { loadInventoryWorkspace } from '@/lib/ops/inventory';

function mapInventoryError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
    ? String((error as { code?: string }).code)
    : error instanceof Error
      ? error.message
      : 'INVENTORY_WORKSPACE_FAILED';
  return { code, message: code };
}

export async function GET() {
  try {
    const ctx = requireOwnerRole(await requireOpsActorContext());
    const workspace = await loadInventoryWorkspace({ cafeId: ctx.cafeId, databaseKey: ctx.databaseKey });
    return NextResponse.json({ ok: true, workspace });
  } catch (error) {
    const mapped = mapInventoryError(error);
    return NextResponse.json({ ok: false, error: mapped }, { status: 400 });
  }
}
