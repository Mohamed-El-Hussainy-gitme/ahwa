export type BaseRole = 'owner' | 'staff';
export type ShiftRole = 'supervisor' | 'waiter' | 'barista' | 'shisha';

export type RuntimeViewer = {
  readonly id: string;
  readonly name: string;
  readonly cafeId: string;
  readonly baseRole: BaseRole;
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
  readonly viewDashboard: boolean;
  readonly viewShift: boolean;
  readonly takeOrders: boolean;
  readonly kitchen: boolean;
  readonly billing: boolean;
  readonly manageMenu: boolean;
  readonly manageStaff: boolean;
  readonly manageShifts: boolean;
};

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
  const owner = !!user && user.baseRole === 'owner';
  return {
    owner,
    viewDashboard: owner || effectiveRole === 'supervisor',
    viewShift: owner || effectiveRole === 'supervisor',
    takeOrders: owner || effectiveRole === 'waiter' || effectiveRole === 'supervisor',
    kitchen: owner || effectiveRole === 'barista' || effectiveRole === 'shisha',
    billing: owner || effectiveRole === 'supervisor',
    manageMenu: owner,
    manageStaff: owner,
    manageShifts: owner,
  };
}
