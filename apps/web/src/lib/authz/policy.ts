export type BaseRole = 'owner' | 'staff';
export type ShiftRole = 'supervisor' | 'waiter' | 'american_waiter' | 'barista' | 'shisha';
export type OwnerLabel = 'owner' | 'partner' | 'branch_manager' | null | undefined;

export type RuntimeViewer = {
  readonly id: string;
  readonly name: string;
  readonly cafeId: string;
  readonly baseRole: BaseRole;
  readonly ownerLabel?: OwnerLabel;
};

export type RuntimeShift = {
  readonly id: string;
  readonly kind: 'morning' | 'evening';
  readonly startedAt: number;
  readonly endedAt?: number;
  readonly isOpen: boolean;
  readonly supervisorUserId: string;
  readonly assignments: readonly { readonly userId: string; readonly role: ShiftRole }[];
};

export type AuthzFlags = {
  readonly owner: boolean;
  readonly branchManager: boolean;
  readonly viewDashboard: boolean;
  readonly viewShift: boolean;
  readonly takeOrders: boolean;
  readonly kitchen: boolean;
  readonly billing: boolean;
  readonly manageMenu: boolean;
  readonly manageStaff: boolean;
  readonly manageShifts: boolean;
  readonly viewWeeklyReportsOnly: boolean;
  readonly viewAllReports: boolean;
  readonly viewReports: boolean;
};

function isBranchManagerUser(user: RuntimeViewer | null): boolean {
  return !!user && user.baseRole === 'owner' && user.ownerLabel === 'branch_manager';
}

function isOwnerLikeUser(user: RuntimeViewer | null): boolean {
  return !!user && user.baseRole === 'owner';
}

export function resolveEffectiveRole(input: {
  readonly user: RuntimeViewer | null;
  readonly shift: RuntimeShift | null;
  readonly ownerViewRole: ShiftRole;
}): ShiftRole | null {
  const { user, shift, ownerViewRole } = input;
  if (!user) return null;
  if (user.baseRole === 'owner') return ownerViewRole;
  if (!shift) return null;
  return shift.assignments.find((item) => item.userId === user.id)?.role ?? null;
}

export function resolvePermissions(input: {
  readonly user: RuntimeViewer | null;
  readonly effectiveRole: ShiftRole | null;
}): AuthzFlags {
  const { user, effectiveRole } = input;
  const ownerLike = isOwnerLikeUser(user);
  const branchManager = isBranchManagerUser(user);
  const fullOwner = ownerLike && !branchManager;
  const allShiftAccess =
    effectiveRole === 'american_waiter' ||
    effectiveRole === 'supervisor';

  return {
    owner: fullOwner,
    branchManager,
    viewDashboard: !!user,
    viewShift: ownerLike || effectiveRole === 'supervisor',
    takeOrders: ownerLike || effectiveRole === 'waiter' || allShiftAccess,
    kitchen: ownerLike || effectiveRole === 'barista' || effectiveRole === 'shisha' || effectiveRole === 'american_waiter',
    billing: ownerLike || effectiveRole === 'supervisor' || effectiveRole === 'american_waiter',
    manageMenu: ownerLike,
    manageStaff: ownerLike,
    manageShifts: ownerLike,
    viewWeeklyReportsOnly: branchManager,
    viewAllReports: fullOwner,
    viewReports: ownerLike,
  };
}
