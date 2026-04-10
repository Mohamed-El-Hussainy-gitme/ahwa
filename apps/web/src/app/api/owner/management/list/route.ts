import { NextResponse } from 'next/server';
import { requireManagementAccess, requireOpsActorContext, isBranchManager } from '@/app/api/ops/_helpers';
import { listOwnerAccounts } from '@/lib/ops/owner-admin';

export async function GET() {
  try {
    const ctx = requireManagementAccess(await requireOpsActorContext());
    const accounts = await listOwnerAccounts({ cafeId: ctx.cafeId, databaseKey: ctx.databaseKey });

    return NextResponse.json({
      ok: true,
      accounts: accounts
        .filter((item) => item.ownerLabel !== 'owner' || !isBranchManager(ctx))
        .map((item) => ({
          id: item.id,
          fullName: item.fullName,
          phone: item.phone,
          ownerLabel: item.ownerLabel,
          isActive: item.isActive,
          createdAt: item.createdAt,
        })),
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'MANAGEMENT_LIST_FAILED';
    return NextResponse.json({ ok: false, error: code }, { status: 400 });
  }
}
