import { NextResponse } from 'next/server';
import { requireOpsActorContext, requireOwnerOrManager } from '@/app/api/ops/_helpers';
import { listOwnerAccounts, listStaffMembers } from '@/lib/ops/owner-admin';

export async function GET() {
  try {
    const ctx = requireOwnerOrManager(await requireOpsActorContext());

    const [staff, owners] = await Promise.all([
      listStaffMembers({ cafeId: ctx.cafeId, databaseKey: ctx.databaseKey }, true),
      listOwnerAccounts({ cafeId: ctx.cafeId, databaseKey: ctx.databaseKey }, true),
    ]);

    return NextResponse.json({
      ok: true,
      actors: [
        ...owners.filter((item) => item.isActive).map((item) => ({
          id: item.id,
          fullName: item.fullName,
          employeeCode: item.phone,
          actorType: 'owner',
          accountKind: 'owner',
          isActive: item.isActive,
          employmentStatus: 'active',
          isCurrentOwner: item.id === ctx.actorOwnerId,
          ownerLabel: item.ownerLabel,
        })),
        ...staff.map((item) => ({
          id: item.id,
          fullName: item.fullName,
          employeeCode: item.employeeCode,
          actorType: 'staff',
          accountKind: 'employee',
          isActive: item.isActive,
          employmentStatus: item.employmentStatus,
          isCurrentOwner: false,
        })),
      ],
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'SHIFT_ASSIGNABLE_ACTORS_FAILED';
    return NextResponse.json({ ok: false, error: code }, { status: 400 });
  }
}
