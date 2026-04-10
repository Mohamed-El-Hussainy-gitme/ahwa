import type { ShiftRole } from '@/lib/authz/policy';

export type RoleLabelContext = 'person' | 'team' | 'page';

export function ownerAccountLabel(ownerLabel?: 'owner' | 'partner' | 'branch_manager' | null): string {
  if (ownerLabel === 'partner') return 'الشريك';
  if (ownerLabel === 'branch_manager') return 'مدير الفرع';
  return 'المالك';
}

export function shiftRoleLabel(role: ShiftRole | null | undefined, context: RoleLabelContext = 'person'): string {
  if (!role) return 'غير محدد';

  switch (role) {
    case 'supervisor':
      return 'مشرف التشغيل';
    case 'waiter':
      return context === 'person' ? 'مضيف الصالة' : 'الصالة';
    case 'american_waiter':
      return context === 'person' ? 'أميركان ويتر' : 'أميركان ويتر';
    case 'barista':
      return 'الباريستا';
    case 'shisha':
      return context === 'person' ? 'مختص الشيشة' : 'الشيشة';
    default:
      return 'غير محدد';
  }
}

export function ledgerActorLabel(label: string | null | undefined): string {
  if (label === 'owner') return 'المالك';
  if (label === 'staff') return 'فريق التشغيل';
  return 'غير محدد';
}
