'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { normalizeCafeSlug } from '@/lib/cafes/slug';
import { writeRuntimeResumeToken } from '@/lib/runtime/resume-storage';
import BrandLogo from '@/ui/brand/BrandLogo';

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
      return 'تم حفظ كلمة المرور بنجاح، لكن تعذر تسجيل الدخول تلقائيًا الآن. ادخل من صفحة المالك بنفس البيانات الجديدة.';
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
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedSlug, setResolvedSlug] = useState('');

  const slugFromQuery = useMemo(
    () => normalizeCafeSlug(searchParams.get('slug') || ''),
    [searchParams],
  );

  useEffect(() => {
    const nextSlug = slugFromQuery || readLastCafeSlug();
    if (!nextSlug) {
      return;
    }

    setResolvedSlug(nextSlug);
    writeLastCafeSlug(nextSlug);
  }, [slugFromQuery]);

  async function onSubmit(event?: FormEvent) {
    event?.preventDefault();
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
      const response = await fetch('/api/auth/owner-password/setup', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: resolvedSlug, phone, setupCode, newPassword }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        const nextAction = payload && typeof payload === 'object' ? (payload as { next?: { action?: string; slug?: string } }).next : undefined;
        const nextSlug = nextAction?.slug ? normalizeCafeSlug(nextAction.slug) : resolvedSlug;
        if ((payload as { passwordSet?: unknown }).passwordSet === true && nextAction?.action === 'login_manually') {
          if (nextSlug) {
            writeLastCafeSlug(nextSlug);
          }
          router.replace(nextSlug ? `/owner-login?slug=${encodeURIComponent(nextSlug)}` : '/owner-login');
          return;
        }
        setError(typeof payload.error === 'string' ? payload.error : 'OWNER_PASSWORD_SETUP_FAILED');
        return;
      }

      writeLastCafeSlug(resolvedSlug);
      writeRuntimeResumeToken(typeof payload.resumeToken === 'string' ? payload.resumeToken : null);
      router.replace('/dashboard');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function submitOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    void onSubmit();
  }

  const message = error === 'PASSWORD_CONFIRMATION_MISMATCH' ? 'تأكيد كلمة المرور غير مطابق.' : errorMessage(error);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[linear-gradient(180deg,#f4efe7_0%,#eadcc8_100%)] p-4">
      <div className="w-full max-w-sm rounded-[28px] border border-[#d9cabb] bg-[#fffaf4] p-6 shadow-[0_18px_48px_rgba(30,23,18,0.08)]">
        <div className="mb-3">
          <BrandLogo className="mx-auto w-[220px]" priority />
        </div>
        <div className="text-center">
          <div className="text-xl font-semibold text-[#1e1712]">تفعيل أو إعادة تعيين كلمة المرور</div>
          <div className="mt-1 text-sm text-[#6b5a4c]">أدخل الرمز الذي وصلك من الدعم أو من إدارة المنصة</div>
          {resolvedSlug ? (
            <div className="mt-1 text-xs text-[#6b5a4c]">
              القهوة: <span className="font-semibold text-[#1e1712]">{resolvedSlug}</span>
            </div>
          ) : null}
        </div>
        <form className="mt-4 space-y-2" onSubmit={onSubmit}>
          <input dir="ltr" className="w-full rounded-2xl border border-[#d9cabb] bg-white px-4 py-3 text-left text-[#1e1712] outline-none placeholder:text-[#9d8b79]" placeholder="رقم الموبايل" value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" enterKeyHint="next" />
          <input dir="ltr" className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-3 text-left uppercase" placeholder="كود التفعيل / إعادة التعيين" value={setupCode} onChange={(event) => setSetupCode(event.target.value.toUpperCase())} autoCapitalize="characters" enterKeyHint="next" />
          <div className="relative">
            <input className="w-full rounded-2xl border border-[#d9cabb] bg-white px-4 py-3 pl-20 text-right text-[#1e1712] outline-none placeholder:text-[#9d8b79]" placeholder="كلمة المرور الجديدة" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} onKeyDown={submitOnEnter} type={showNewPassword ? 'text' : 'password'} enterKeyHint="next" />
            <button type="button" onClick={() => setShowNewPassword((value) => !value)} className="absolute inset-y-0 left-3 inline-flex items-center rounded-xl px-2 text-xs font-semibold text-[#6b5a4c]">{showNewPassword ? 'إخفاء' : 'إظهار'}</button>
          </div>
          <div className="relative">
            <input className="w-full rounded-2xl border border-[#d9cabb] bg-white px-4 py-3 pl-20 text-right text-[#1e1712] outline-none placeholder:text-[#9d8b79]" placeholder="تأكيد كلمة المرور الجديدة" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} onKeyDown={submitOnEnter} type={showConfirmPassword ? 'text' : 'password'} enterKeyHint="go" />
            <button type="button" onClick={() => setShowConfirmPassword((value) => !value)} className="absolute inset-y-0 left-3 inline-flex items-center rounded-xl px-2 text-xs font-semibold text-[#6b5a4c]">{showConfirmPassword ? 'إخفاء' : 'إظهار'}</button>
          </div>
          <button type="submit" disabled={busy} className="w-full rounded-2xl bg-[#1e1712] px-4 py-3 font-semibold text-white disabled:opacity-60">{busy ? '...' : 'حفظ والدخول'}</button>
          {message ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</div> : null}
          <button type="button" onClick={() => router.push(resolvedSlug ? `/owner-login?slug=${encodeURIComponent(resolvedSlug)}` : '/owner-login')} className="w-full rounded-2xl border border-[#d9cabb] bg-[#f7efe4] px-4 py-3 text-sm font-medium text-[#6b5a4c]">الرجوع إلى دخول المالك</button>
        </form>
      </div>
    </div>
  );
}
