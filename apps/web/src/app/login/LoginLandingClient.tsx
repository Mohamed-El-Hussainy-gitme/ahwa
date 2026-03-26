'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { normalizeCafeSlug } from '@/lib/cafes/slug';
import LoginClient from '@/app/c/[slug]/login/LoginClient';
import BrandLogo from '@/ui/brand/BrandLogo';
import { AppIcon } from '@/ui/icons/AppIcon';

export default function LoginLandingClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedSlug = normalizeCafeSlug(searchParams.get('slug') ?? '');
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('ahwa.lastCafeSlug') : null;
    if (requestedSlug) {
      setSlug(requestedSlug);
      if (typeof window !== 'undefined') {
        localStorage.setItem('ahwa.lastCafeSlug', requestedSlug);
      }
      return;
    }
    if (saved && !slug) setSlug(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedSlug]);

  function ownerHref(preferredSlug?: string) {
    const next = searchParams.get('next');
    const qs = new URLSearchParams();
    const effectiveSlug = normalizeCafeSlug(preferredSlug ?? slug);
    if (effectiveSlug) qs.set('slug', effectiveSlug);
    if (next) qs.set('next', next);
    const query = qs.toString();
    return `/owner-login${query ? `?${query}` : ''}`;
  }

  async function go() {
    setErr(null);
    const normalizedSlug = normalizeCafeSlug(slug);
    if (!normalizedSlug) {
      setErr('INVALID_SLUG');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/auth/cafe-exists?slug=${encodeURIComponent(normalizedSlug)}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.ok) {
        setErr('CHECK_FAILED');
        return;
      }
      if (!payload.exists) {
        setErr('CAFE_NOT_FOUND');
        return;
      }

      localStorage.setItem('ahwa.lastCafeSlug', normalizedSlug);
      const e = searchParams.get('e');
      const next = searchParams.get('next');
      const qs = new URLSearchParams();
      qs.set('slug', normalizedSlug);
      if (e) qs.set('e', e);
      if (next) qs.set('next', next);
      router.push(`/login?${qs.toString()}`);
    } finally {
      setBusy(false);
    }
  }

  async function goOwner() {
    setErr(null);
    const normalizedSlug = normalizeCafeSlug(slug)
      || (typeof window !== 'undefined' ? normalizeCafeSlug(localStorage.getItem('ahwa.lastCafeSlug') ?? '') : '');
    if (!normalizedSlug) {
      router.push(ownerHref());
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/auth/cafe-exists?slug=${encodeURIComponent(normalizedSlug)}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.ok || !payload.exists) {
        setErr(!payload.exists ? 'CAFE_NOT_FOUND' : 'CHECK_FAILED');
        return;
      }
      localStorage.setItem('ahwa.lastCafeSlug', normalizedSlug);
      router.push(ownerHref(normalizedSlug));
    } finally {
      setBusy(false);
    }
  }

  if (requestedSlug) {
    return <LoginClient cafeSlug={requestedSlug} />;
  }

  const e = searchParams.get('e');
  const msg =
    e === 'no_shift'
      ? 'لا توجد وردية مفتوحة الآن.'
      : e === 'not_assigned'
        ? 'بانتظار تعيين دورك داخل الوردية.'
        : e === 'cafe_not_found'
          ? 'القهوة غير موجودة.'
          : e === 'pin_changed'
            ? 'تم تحديث رمز الدخول. يرجى تسجيل الدخول مرة أخرى.'
            : null;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[linear-gradient(180deg,#f4efe7_0%,#eadcc8_100%)] p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-[32px] border border-[#d9cabb] bg-[#fffaf4] shadow-[0_28px_72px_rgba(30,23,18,0.12)]">
        <div className="border-b border-[#eadfce] bg-[linear-gradient(180deg,#fffaf4_0%,#f5eadc_100%)] px-6 pb-5 pt-6">
          <BrandLogo className="mx-auto w-[220px]" priority />

          <div className="mt-5 text-center">
            <div className="text-[11px] font-semibold tracking-[0.26em] text-[#9b6b2e]">بوابة القهوة</div>
            <div className="mt-2 text-[28px] font-black leading-tight text-[#1e1712]">دخول القهوة</div>
            <div className="mt-2 text-sm leading-7 text-[#6b5a4c]">
              أدخل رمز القهوة للوصول إلى شاشة التشغيل المناسبة.
            </div>
          </div>
        </div>

        <div className="px-6 py-5">
          <div className="mb-4 grid grid-cols-2 gap-2">
            <div className="rounded-[20px] border border-[#e6d8c8] bg-[#fbf5ed] p-3 text-right">
              <div className="text-[11px] font-semibold tracking-[0.18em] text-[#9b6b2e]">التشغيل</div>
              <div className="mt-1 text-sm font-semibold text-[#1e1712]">تشغيل يومي</div>
            </div>
            <div className="rounded-[20px] border border-[#e6d8c8] bg-[#fbf5ed] p-3 text-right">
              <div className="text-[11px] font-semibold tracking-[0.18em] text-[#9b6b2e]">الإدارة</div>
              <div className="mt-1 text-sm font-semibold text-[#1e1712]">وصول المالك</div>
            </div>
          </div>

          {msg ? (
            <div className="mb-4 rounded-[20px] border border-[#ecd9bd] bg-[#fcf3e7] p-3 text-right text-sm text-[#a5671e]">
              {msg}
            </div>
          ) : null}

          <label className="mb-2 block text-right text-sm font-semibold text-[#4e4034]">رمز القهوة</label>
          <div className="relative">
            <input
              className="w-full rounded-[20px] border border-[#d9cabb] bg-white px-4 py-3.5 text-left text-[#1e1712] outline-none placeholder:text-[#9d8b79]"
              dir="ltr"
              placeholder="fishawy"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
            />
            <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[#9b6b2e]">
              <AppIcon name="building" className="h-4 w-4" />
            </div>
          </div>

          {err ? (
            <div className="mt-3 rounded-[20px] border border-[#e6c7c2] bg-[#fff3f1] p-3 text-right text-sm text-[#9a3e35]">
              {err === 'INVALID_SLUG'
                ? 'اكتب رمز القهوة بصيغة صحيحة.'
                : err === 'CAFE_NOT_FOUND'
                  ? 'القهوة غير موجودة أو غير مفعلة حاليًا.'
                  : 'تعذر التحقق الآن. حاول مرة أخرى.'}
            </div>
          ) : null}

          <button
            onClick={go}
            disabled={busy}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[20px] bg-[#1e1712] px-4 py-3.5 text-sm font-semibold text-white shadow-[0_16px_30px_rgba(30,23,18,0.18)] transition hover:translate-y-[-1px] disabled:opacity-60"
          >
            <AppIcon name="dashboard" className="h-4 w-4" />
            {busy ? 'جارٍ التحقق...' : 'متابعة إلى التشغيل'}
          </button>

          <button
            onClick={goOwner}
            disabled={busy}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-[20px] border border-[#d9cabb] bg-[#f7efe4] px-4 py-3.5 text-sm font-semibold text-[#1e1712] transition hover:bg-[#f3e7d7] disabled:opacity-60"
          >
            <AppIcon name="crown" className="h-4 w-4 text-[#9b6b2e]" />
            دخول المالك
          </button>

          <a
            href={`/support?source=login${slug ? `&slug=${encodeURIComponent(slug)}` : ''}`}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-[20px] border border-[#ead5b8] bg-[#fbf3e8] px-4 py-3.5 text-center text-sm font-semibold text-[#7c5222] transition hover:bg-[#f5e6d1]"
          >
            <AppIcon name="support" className="h-4 w-4" />
            تحتاج مساعدة؟
          </a>
        </div>
      </div>
    </div>
  );
}
