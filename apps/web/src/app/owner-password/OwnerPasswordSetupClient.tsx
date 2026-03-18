'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { normalizeCafeSlug } from '@/lib/cafes/slug';
import BrandLogo from '@/ui/brand/BrandLogo';

function errorMessage(error: string | null) {
  switch (error) {
    case 'INVALID_INPUT':
      return 'أدخل كل الحقول المطلوبة، وكلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.';
    case 'MISSING_CAFE_SLUG':
      return 'حدد القهوة أولاً.';
    case 'invalid_owner_password_setup_code':
      return 'كود التفعيل أو إعادة التعيين غير صحيح.';
    case 'owner_password_setup_expired':
      return 'انتهت صلاحية الكود. اطلب من الدعم إصدار كود جديد.';
    case 'owner_password_setup_not_pending':
      return 'هذا الحساب لا ينتظر تفعيلًا أو إعادة تعيين حاليًا.';
    case 'owner_password_too_short':
      return 'كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.';
    case 'cafe_not_found':
    case 'CAFE_NOT_FOUND':
      return 'القهوة غير موجودة أو غير مفعلة.';
    case 'OWNER_PASSWORD_SET_LOGIN_UNAVAILABLE':
      return 'تم حفظ كلمة المرور بنجاح، لكن تعذر تسجيل الدخول تلقائيًا الآن. ادخل من صفحة المعلم بنفس البيانات الجديدة.';
    default:
      return error ? 'تعذر إكمال العملية.' : '';
  }
}

export default function OwnerPasswordSetupClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [phone, setPhone] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedSlug, setResolvedSlug] = useState('');

  const slugFromQuery = useMemo(() => normalizeCafeSlug(searchParams.get('slug') || ''), [searchParams]);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('ahwa.lastCafeSlug') : null;
    const nextSlug = slugFromQuery || normalizeCafeSlug(saved ?? '');
    if (nextSlug) {
      setResolvedSlug(nextSlug);
      if (typeof window !== 'undefined') {
        localStorage.setItem('ahwa.lastCafeSlug', nextSlug);
      }
    }
  }, [slugFromQuery]);

  async function onSubmit() {
    setError(null);
    if (!resolvedSlug || !phone.trim() || !setupCode.trim() || !newPassword || !confirmPassword) {
      setError('INVALID_INPUT');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('PASSWORD_CONFIRMATION_MISMATCH');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/owner-password/setup', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: resolvedSlug,
          phone,
          setupCode,
          newPassword,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        const nextAction = json && typeof json === 'object' ? (json as { next?: { action?: string; slug?: string } }).next : undefined;
        const nextSlug = nextAction?.slug ? normalizeCafeSlug(nextAction.slug) : resolvedSlug;
        if ((json as { passwordSet?: unknown }).passwordSet === true && nextAction?.action === 'login_manually') {
          if (typeof window !== 'undefined' && nextSlug) {
            localStorage.setItem('ahwa.lastCafeSlug', nextSlug);
          }
          router.replace(nextSlug ? `/owner-login?slug=${encodeURIComponent(nextSlug)}` : '/owner-login');
          return;
        }
        setError(typeof json.error === 'string' ? json.error : 'OWNER_PASSWORD_SETUP_FAILED');
        return;
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem('ahwa.lastCafeSlug', resolvedSlug);
      }
      router.replace('/dashboard');
    } finally {
      setBusy(false);
    }
  }

  const message = error === 'PASSWORD_CONFIRMATION_MISMATCH'
    ? 'تأكيد كلمة المرور غير مطابق.'
    : errorMessage(error);

  return (
    <div className="min-h-dvh bg-gradient-to-b from-amber-50 to-slate-50 p-4 flex items-center justify-center">
      <div className="w-full max-w-sm rounded-3xl border border-neutral-200/70 bg-white p-5 shadow-sm">
        <div className="mb-3">
          <BrandLogo className="mx-auto w-[220px]" priority />
        </div>

        <div className="text-center">
          <div className="text-xl font-semibold text-neutral-900">تفعيل أو إعادة تعيين كلمة المرور</div>
          <div className="mt-0.5 text-sm text-neutral-500">أدخل الكود الذي وصلك من الدعم أو من إدارة المنصة</div>
          {resolvedSlug ? <div className="mt-1 text-xs text-neutral-500">القهوة: <span className="font-semibold">{resolvedSlug}</span></div> : null}
        </div>

        <div className="mt-4 space-y-2">
          <input dir="ltr" className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-3 text-left" placeholder="رقم الموبايل" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          <input dir="ltr" className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-3 text-left uppercase" placeholder="كود التفعيل / إعادة التعيين" value={setupCode} onChange={(e) => setSetupCode(e.target.value.toUpperCase())} autoCapitalize="characters" />
          <input className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-3 text-right" placeholder="كلمة المرور الجديدة" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" />
          <input className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-3 text-right" placeholder="تأكيد كلمة المرور الجديدة" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} type="password" />

          <button onClick={onSubmit} disabled={busy} className="w-full rounded-2xl bg-neutral-900 px-4 py-3 font-semibold text-white disabled:opacity-60">
            {busy ? '...' : 'حفظ والدخول'}
          </button>

          {message ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</div> : null}

          <button type="button" onClick={() => router.push(resolvedSlug ? `/owner-login?slug=${encodeURIComponent(resolvedSlug)}` : '/owner-login')} className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-neutral-700">
            الرجوع إلى دخول المعلم
          </button>
        </div>
      </div>
    </div>
  );
}
