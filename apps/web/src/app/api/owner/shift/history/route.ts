import { NextResponse } from 'next/server';
import { requireOpsActorContext } from '@/app/api/ops/_helpers';
import { listShiftHistory } from '@/lib/ops/owner-admin';

export async function GET() {
  try {
    const ctx = await requireOpsActorContext();
    const allowed = ctx.accountKind === 'owner' || ctx.shiftRole === 'supervisor';
    if (!allowed) {
      return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
    }

    const shifts = await listShiftHistory(ctx.cafeId, 50);
    return NextResponse.json({ ok: true, shifts });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'SHIFT_HISTORY_FAILED';
    return NextResponse.json({ ok: false, error: code }, { status: 400 });
  }
}
