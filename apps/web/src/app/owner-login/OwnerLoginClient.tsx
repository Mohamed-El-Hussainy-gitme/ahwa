'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { normalizeCafeSlug } from '@/lib/cafes/slug';
import BrandLogo from '@/ui/brand/BrandLogo';
import { AppIcon } from '@/ui/icons/AppIcon';

export default function OwnerLoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resolvedSlug, setResolvedSlug] = useState('');

  const slugFromQuery = useMemo(() => normalizeCafeSlug(searchParams.get('slug') || ''), [searchParams]);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('ahwa.lastCafeSlug') : null;
    const nextSlug = slugFromQuery || normalizeCafeSlug(saved ?? '');
    if (nextSlug) {
      setResolvedSlug(nextSlug);
      if (typeof window !== 'undefined') localStorage.setItem('ahwa.lastCafeSlug', nextSlug);
    }
  }, [slugFromQuery]);

  function resolveSafeNext() {
    const next = searchParams.get('next');
    if (!next || !next.startsWith('/')) return '/dashboard';
    if (next === '/owner-password' || next.startsWith('/owner-password?') || next.startsWith('/owner-password/')) return '/dashboard';
    return next;
  }

  async function onSubmit(event?: FormEvent) {
    event?.preventDefault();
    setErr(null);
    if (!phone.trim() || !password.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/auth/owner-login', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone, password, slug: resolvedSlug || undefined }) });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.ok) {
        setErr(payload.error ?? 'LOGIN_FAILED');
        return;
      }
      if (resolvedSlug && typeof window !== 'undefined') localStorage.setItem('ahwa.lastCafeSlug', resolvedSlug);
      router.replace(resolveSafeNext());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[linear-gradient(180deg,#f4efe7_0%,#eadcc8_100%)] p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-[32px] border border-[#d9cabb] bg-[#fffaf4] shadow-[0_28px_72px_rgba(30,23,18,0.12)]">
        <div className="border-b border-[#eadfce] bg-[linear-gradient(180deg,#fffaf4_0%,#f5eadc_100%)] px-6 pb-5 pt-6">
          <BrandLogo className="mx-auto w-[220px]" priority />
          <div className="mt-5 text-center">
            <div className="text-[11px] font-semibold tracking-[0.26em] text-[#9b6b2e]">بوابة الإدارة</div>
            <div className="mt-2 text-[28px] font-black leading-tight text-[#1e1712]">دخول المالك</div>
            <div className="mt-2 text-sm leading-7 text-[#6b5a4c]">رقم الجوال وكلمة المرور للوصول إلى مساحة الإدارة.</div>
          </div>
          {resolvedSlug ? <div className="mt-4 flex items-center justify-center gap-2 rounded-[20px] border border-[#e6d8c8] bg-[#fbf5ed] px-4 py-3 text-sm font-semibold text-[#4e4034]"><AppIcon name="building" className="h-4 w-4 text-[#9b6b2e]" /><span>القهوة:</span><span className="font-black text-[#1e1712]" dir="ltr">{resolvedSlug}</span></div> : null}
        </div>
        <div className="px-6 py-5">
          <form className="space-y-3" onSubmit={onSubmit}>
            <div>
              <label className="mb-2 block text-right text-sm font-semibold text-[#4e4034]">رقم الجوال</label>
              <div className="relative">
                <input dir="ltr" className="w-full rounded-[20px] border border-[#d9cabb] bg-white px-4 py-3.5 pr-11 text-left text-[#1e1712] outline-none placeholder:text-[#9d8b79]" placeholder="01XXXXXXXXX" value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" enterKeyHint="next" />
                <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[#9b6b2e]"><AppIcon name="phone" className="h-4 w-4" /></div>
              </div>
            </div>
            <div>
              <label className="mb-2 block text-right text-sm font-semibold text-[#4e4034]">كلمة المرور</label>
              <div className="relative">
                <input className="w-full rounded-[20px] border border-[#d9cabb] bg-white px-4 py-3.5 pl-20 pr-11 text-right text-[#1e1712] outline-none placeholder:text-[#9d8b79]" placeholder="كلمة المرور" value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? 'text' : 'password'} enterKeyHint="go" />
                <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[#9b6b2e]"><AppIcon name="lock" className="h-4 w-4" /></div>
                <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 left-3 inline-flex items-center rounded-xl px-2 text-xs font-semibold text-[#6b5a4c]">{showPassword ? 'إخفاء' : 'إظهار'}</button>
              </div>
            </div>
            <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-[20px] bg-[#1e1712] px-4 py-3.5 text-sm font-semibold text-white shadow-[0_16px_30px_rgba(30,23,18,0.18)] transition hover:translate-y-[-1px] disabled:opacity-60"><AppIcon name="crown" className="h-4 w-4 text-[#f1e1cb]" />{busy ? 'جارٍ تسجيل الدخول...' : 'دخول إلى الإدارة'}</button>
            <button type="button" onClick={() => router.push(resolvedSlug ? `/owner-password?slug=${encodeURIComponent(resolvedSlug)}` : '/owner-password')} className="inline-flex w-full items-center justify-center gap-2 rounded-[20px] border border-[#d9cabb] bg-[#f7efe4] px-4 py-3.5 text-sm font-medium text-[#6b5a4c] transition hover:bg-[#f3e7d7]"><AppIcon name="spark" className="h-4 w-4 text-[#9b6b2e]" />لدي كود تفعيل أو إعادة تعيين</button>
            {err ? <div className="rounded-[20px] border border-[#e6c7c2] bg-[#fff3f1] p-3 text-right text-sm text-[#9a3e35]">{err === 'BAD_CREDENTIALS' ? 'بيانات الدخول غير صحيحة.' : err === 'PARTNER_NOT_FOUND' || err === 'invalid_owner_credentials' ? 'بيانات الدخول غير صحيحة.' : err === 'MISSING_CAFE_SLUG' ? 'حدد القهوة أولًا من شاشة الدخول.' : err === 'CAFE_NOT_FOUND' ? 'القهوة غير موجودة أو غير مفعلة.' : 'حدث خطأ غير متوقع. حاول مرة أخرى.'}</div> : null}
          </form>
        </div>
      </div>
    </div>
  );
}
