import { requireOpsActorContext, requireOwnerRole } from '@/app/api/ops/_helpers';
import { releaseStaleIdempotencyLocks } from '@/lib/ops/recovery';
import { apiFail } from '@/app/api/_shared';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const ctx = requireOwnerRole(await requireOpsActorContext());
    const result = await releaseStaleIdempotencyLocks(ctx.cafeId);
    return NextResponse.json({
      ok: true,
      code: result.releasedCount > 0 ? 'RECOVERY_LOCKS_RELEASED' : 'RECOVERY_NO_STALE_LOCKS',
      releasedCount: result.releasedCount,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'RECOVERY_RELEASE_LOCKS_FAILED';
    return apiFail(400, code, code);
  }
}
