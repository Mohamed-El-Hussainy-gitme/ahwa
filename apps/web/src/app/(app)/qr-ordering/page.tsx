'use client';

import { MobileShell } from '@/ui/MobileShell';
import { useAuthz } from '@/lib/authz';
import { AccessDenied } from '@/ui/AccessState';
import { OwnerPublicOrderingCard } from '../owner/OwnerPublicOrderingCard';
import { PublicMenuContentManager } from './PublicMenuContentManager';

export default function QrOrderingPage() {
  const { can } = useAuthz();

  if (!can.owner) {
    return <AccessDenied title="QR الطلب" />;
  }

  return (
    <MobileShell title="QR الطلب" backHref="/owner" desktopMode="admin">
      <section className="space-y-5">
        <div className="rounded-[28px] border border-[#dccdbb] bg-[linear-gradient(180deg,#fff9f2_0%,#f6ecdf_100%)] p-5 shadow-[0_18px_40px_rgba(30,23,18,0.08)] lg:p-6">
          <div className="text-[11px] font-semibold tracking-[0.24em] text-[#9b6b2e]">QR ORDERING</div>
          <h1 className="mt-2 text-[26px] font-black leading-tight text-[#1e1712] md:text-[32px]">بطاقة QR للطلب الذاتي</h1>
          <p className="mt-2 max-w-4xl text-sm leading-7 text-[#6b5a4c] md:text-[15px]">
            اطبع البطاقة وادِر وصف وصور أصناف QR من نفس الصفحة.
          </p>
        </div>

        <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)] xl:items-start">
          <div className="xl:sticky xl:top-24">
            <OwnerPublicOrderingCard />
          </div>
          <PublicMenuContentManager />
        </div>
      </section>
    </MobileShell>
  );
}
