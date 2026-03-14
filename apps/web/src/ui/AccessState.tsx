import { MobileShell } from '@/ui/MobileShell';

export function AccessDenied({ title, backHref = '/dashboard', message = 'غير مسموح' }: { title: string; backHref?: string; message?: string }) {
  return (
    <MobileShell title={title} backHref={backHref}>
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-right text-sm text-red-700">{message}</div>
    </MobileShell>
  );
}

export function ShiftRequired({ title, backHref = '/dashboard', message = 'لا توجد وردية مفتوحة.' }: { title: string; backHref?: string; message?: string }) {
  return (
    <MobileShell title={title} backHref={backHref}>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-right text-sm text-amber-900">{message}</div>
    </MobileShell>
  );
}
