import { NextResponse } from 'next/server';
import { requireOpsActorContext, requireOwnerOrSupervisor } from '@/app/api/ops/_helpers';
import { readRecoveryState } from '@/lib/ops/recovery';
import { apiFail } from '@/app/api/_shared';

export async function GET() {
  try {
    const ctx = requireOwnerOrSupervisor(await requireOpsActorContext());
    const recovery = await readRecoveryState(ctx.cafeId);
    return NextResponse.json({ ok: true, recovery });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'RECOVERY_STATE_FAILED';
    return apiFail(400, code, code);
  }
}
