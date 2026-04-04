'use client';

import { MobileShell } from '@/ui/MobileShell';
import { useAuthz } from '@/lib/authz';
import { AccessDenied } from '@/ui/AccessState';
import { OwnerPublicOrderingCard } from '../owner/OwnerPublicOrderingCard';

export default function QrOrderingPage() {
  const { can } = useAuthz();

  if (!can.owner) {
    return <AccessDenied title="QR الطلب" />;
  }

  return (
    <MobileShell title="QR الطلب" backHref="/owner">
      <section className="space-y-4">
        <div className="rounded-[28px] border border-[#dccdbb] bg-[linear-gradient(180deg,#fff9f2_0%,#f6ecdf_100%)] p-5 shadow-[0_18px_40px_rgba(30,23,18,0.08)]">
          <div className="text-[11px] font-semibold tracking-[0.24em] text-[#9b6b2e]">QR ORDERING</div>
          <h1 className="mt-2 text-[26px] font-black leading-tight text-[#1e1712]">بطاقة QR للطلب الذاتي</h1>
          <p className="mt-2 text-sm leading-7 text-[#6b5a4c]">
            اطبع البطاقة وعلّقها داخل المقهى ليتمكن الزبائن من فتح المنيو والطلب مباشرة من هواتفهم.
          </p>
        </div>

        <OwnerPublicOrderingCard />
      </section>
    </MobileShell>
  );
}
