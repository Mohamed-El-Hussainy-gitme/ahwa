import { MobileShell } from '@/ui/MobileShell';
import { opsAlert } from '@/ui/ops/premiumStyles';

export function AccessDenied({
  title,
  backHref = '/dashboard',
  message = 'هذه المساحة غير متاحة لك ضمن صلاحياتك الحالية.',
}: {
  title: string;
  backHref?: string;
  message?: string;
}) {
  return (
    <MobileShell title={title} backHref={backHref}>
      <div className={opsAlert('danger')}>{message}</div>
    </MobileShell>
  );
}

export function ShiftRequired({
  title,
  backHref = '/dashboard',
  message = 'لا توجد وردية نشطة الآن.',
}: {
  title: string;
  backHref?: string;
  message?: string;
}) {
  return (
    <MobileShell title={title} backHref={backHref}>
      <div className={opsAlert('warning')}>{message}</div>
    </MobileShell>
  );
}
