'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { normalizeCafeSlug } from '@/lib/cafes/slug';
import BrandLogo from '@/ui/brand/BrandLogo';
import { AppIcon } from '@/ui/icons/AppIcon';

const LAST_CAFE_SLUG_STORAGE_KEY = 'ahwa.lastCafeSlug';

function readLastCafeSlug(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  return normalizeCafeSlug(window.localStorage.getItem(LAST_CAFE_SLUG_STORAGE_KEY) ?? '');
}

function writeLastCafeSlug(slug: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(LAST_CAFE_SLUG_STORAGE_KEY, slug);
}

function buildStaffLoginHref(slug: string, next: string | null, errorCode: string | null): string {
  const params = new URLSearchParams();
  if (next) {
    params.set('next', next);
  }
  if (errorCode) {
    params.set('e', errorCode);
  }

  const query = params.toString();
  return `/c/${encodeURIComponent(slug)}/login${query ? `?${query}` : ''}`;
}

export default function LoginLandingClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const requestedSlug = useMemo(
    () => normalizeCafeSlug(searchParams.get('slug') ?? ''),
    [searchParams],
  );

  useEffect(() => {
    const initialSlug = requestedSlug || readLastCafeSlug();
    if (!initialSlug) {
      return;
    }

    setSlug((current) => current || initialSlug);
    writeLastCafeSlug(initialSlug);
  }, [requestedSlug]);

  function ownerHref(preferredSlug?: string) {
    const next = searchParams.get('next');
    const params = new URLSearchParams();
    const effectiveSlug = normalizeCafeSlug(preferredSlug ?? slug);

    if (effectiveSlug) {
      params.set('slug', effectiveSlug);
    }
    if (next) {
      params.set('next', next);
    }

    const query = params.toString();
    return `/owner-login${query ? `?${query}` : ''}`;
  }

  async function go(event?: FormEvent) {
    event?.preventDefault();
    setErr(null);

    const normalizedSlug = normalizeCafeSlug(slug);
    if (!normalizedSlug) {
      setErr('INVALID_SLUG');
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`/api/auth/cafe-exists?slug=${encodeURIComponent(normalizedSlug)}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        setErr('CHECK_FAILED');
        return;
      }
      if (!payload.exists) {
        setErr('CAFE_NOT_FOUND');
        return;
      }

      writeLastCafeSlug(normalizedSlug);
      router.push(
        buildStaffLoginHref(
          normalizedSlug,
          searchParams.get('next'),
          searchParams.get('e'),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function goOwner() {
    setErr(null);

    const normalizedSlug = normalizeCafeSlug(slug) || readLastCafeSlug();
    if (!normalizedSlug) {
      router.push(ownerHref());
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`/api/auth/cafe-exists?slug=${encodeURIComponent(normalizedSlug)}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok || !payload.exists) {
        setErr(!payload.exists ? 'CAFE_NOT_FOUND' : 'CHECK_FAILED');
        return;
      }

      writeLastCafeSlug(normalizedSlug);
      router.push(ownerHref(normalizedSlug));
    } finally {
      setBusy(false);
    }
  }

  const errorCode = searchParams.get('e');
  const message =
    errorCode === 'no_shift'
      ? 'لا توجد وردية مفتوحة الآن.'
      : errorCode === 'not_assigned'
        ? 'بانتظار تعيين دورك داخل الوردية.'
        : errorCode === 'cafe_not_found'
          ? 'القهوة غير موجودة.'
          : errorCode === 'pin_changed'
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
            <div className="mt-2 text-sm leading-7 text-[#6b5a4c]">أدخل رمز القهوة للوصول إلى شاشة التشغيل المناسبة.</div>
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

          {message ? (
            <div className="mb-4 rounded-[20px] border border-[#ecd9bd] bg-[#fcf3e7] p-3 text-right text-sm text-[#a5671e]">
              {message}
            </div>
          ) : null}

          <form onSubmit={go}>
            <label className="mb-2 block text-right text-sm font-semibold text-[#4e4034]">رمز القهوة</label>
            <div className="relative">
              <input
                className="w-full rounded-[20px] border border-[#d9cabb] bg-white px-4 py-3.5 text-left text-[#1e1712] outline-none placeholder:text-[#9d8b79]"
                dir="ltr"
                placeholder="fishawy"
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                enterKeyHint="go"
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
              type="submit"
              disabled={busy}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[20px] bg-[#1e1712] px-4 py-3.5 text-sm font-semibold text-white shadow-[0_16px_30px_rgba(30,23,18,0.18)] transition hover:translate-y-[-1px] disabled:opacity-60"
            >
              <AppIcon name="dashboard" className="h-4 w-4" />
              {busy ? 'جارٍ التحقق...' : 'متابعة إلى التشغيل'}
            </button>

            <button
              type="button"
              onClick={goOwner}
              disabled={busy}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-[20px] border border-[#d9cabb] bg-[#f7efe4] px-4 py-3.5 text-sm font-semibold text-[#1e1712] transition hover:bg-[#f3e7d7] disabled:opacity-60"
            >
              <AppIcon name="crown" className="h-4 w-4 text-[#9b6b2e]" />
              دخول المالك
            </button>
          </form>

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
