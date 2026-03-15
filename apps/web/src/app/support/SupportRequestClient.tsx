'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

type RuntimeMe = {
  tenantSlug?: string;
  tenantId?: string;
  fullName?: string;
  accountKind?: 'owner' | 'staff';
  ownerLabel?: 'owner' | 'partner';
  shiftRole?: 'supervisor' | 'waiter' | 'barista' | 'shisha';
};

function issueOptions(source: 'login' | 'in_app') {
  return source === 'login'
    ? ['تعذر تسجيل الدخول', 'القهوة غير موجودة', 'مشكلة في الوردية', 'استفسار عام', 'أخرى']
    : ['مشكلة في التشغيل', 'مشكلة في الحساب', 'مشكلة في الآجل', 'مشكلة في التقارير', 'استفسار عام', 'أخرى'];
}

export default function SupportRequestClient() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const source = (searchParams.get('source') === 'in_app' ? 'in_app' : 'login') as 'login' | 'in_app';
  const [runtimeMe, setRuntimeMe] = useState<RuntimeMe | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [form, setForm] = useState({
    senderName: '',
    senderPhone: '',
    cafeName: searchParams.get('cafeName') ?? '',
    cafeSlug: searchParams.get('slug') ?? '',
    issueType: issueOptions(source)[0] ?? 'استفسار عام',
    message: '',
  });

  useEffect(() => {
    if (source !== 'in_app') return;
    let isMounted = true;
    fetch('/api/runtime/me', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as RuntimeMe;
      })
      .then((data) => {
        if (!isMounted || !data) return;
        setRuntimeMe(data);
        setForm((value) => ({
          ...value,
          senderName: value.senderName || data.fullName || '',
          cafeSlug: value.cafeSlug || data.tenantSlug || '',
        }));
      })
      .catch(() => undefined);
    return () => {
      isMounted = false;
    };
  }, [source]);

  const actorLabel = useMemo(() => {
    if (!runtimeMe) return null;
    if (runtimeMe.accountKind === 'owner') return runtimeMe.ownerLabel === 'partner' ? 'شريك' : 'معلم / مالك';
    if (runtimeMe.shiftRole === 'supervisor') return 'مشرف';
    if (runtimeMe.shiftRole === 'barista') return 'باريستا';
    if (runtimeMe.shiftRole === 'shisha') return 'شيشة';
    if (runtimeMe.shiftRole === 'waiter') return 'ويتر';
    return 'مستخدم داخل النظام';
  }, [runtimeMe]);

  async function submit() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/support/messages/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...form,
          source,
          pagePath: source === 'in_app' ? (searchParams.get('page') || pathname) : '/login',
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(json?.error?.message || 'تعذر إرسال الرسالة الآن.');
      }
      setNotice('تم إرسال طلب الدعم وسيتم التواصل معك عبر الهاتف في أقرب وقت.');
      setForm((value) => ({ ...value, message: '' }));
      if (source === 'login') setDismissed(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'تعذر إرسال الرسالة الآن.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh bg-slate-50 p-4" dir="rtl">
      <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">الدعم الفني</h1>
            <p className="mt-1 text-sm text-slate-500">
              {source === 'login'
                ? 'اكتب بياناتك ورسالتك وسنتابع معك عبر الهاتف.'
                : 'أرسل طلب دعم من داخل النظام وسيتم تعبئة بيانات الدخول الحالية تلقائيًا متى أمكن.'}
            </p>
          </div>
          <Link href={source === 'login' ? '/login' : '/dashboard'} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">رجوع</Link>
        </div>

        {notice ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</div> : null}
        {error ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}
        {dismissed && source === 'login' ? <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">يمكنك العودة لصفحة الدخول أو إرسال رسالة أخرى إذا احتجت.</div> : null}

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <input className="rounded-2xl border border-slate-200 px-4 py-3" placeholder="الاسم" value={form.senderName} onChange={(e) => setForm((v) => ({ ...v, senderName: e.target.value }))} />
          <input className="rounded-2xl border border-slate-200 px-4 py-3" placeholder="رقم الهاتف" value={form.senderPhone} onChange={(e) => setForm((v) => ({ ...v, senderPhone: e.target.value }))} />
          <input className="rounded-2xl border border-slate-200 px-4 py-3" placeholder="اسم القهوة" value={form.cafeName} onChange={(e) => setForm((v) => ({ ...v, cafeName: e.target.value }))} />
          <input className="rounded-2xl border border-slate-200 px-4 py-3" placeholder="slug القهوة" value={form.cafeSlug} onChange={(e) => setForm((v) => ({ ...v, cafeSlug: e.target.value }))} />
          <select className="rounded-2xl border border-slate-200 px-4 py-3 md:col-span-2" value={form.issueType} onChange={(e) => setForm((v) => ({ ...v, issueType: e.target.value }))}>
            {issueOptions(source).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <textarea className="min-h-36 rounded-2xl border border-slate-200 px-4 py-3 md:col-span-2" placeholder="اكتب المشكلة أو طلب الدعم بالتفصيل" value={form.message} onChange={(e) => setForm((v) => ({ ...v, message: e.target.value }))} />
        </div>

        {source === 'in_app' && actorLabel ? (
          <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
            سيتم إرسال الطلب كـ <span className="font-semibold">{actorLabel}</span>
            {runtimeMe?.tenantSlug ? <> داخل قهوة <span className="font-semibold">{runtimeMe.tenantSlug}</span></> : null}.
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <button disabled={busy} onClick={submit} className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'جارٍ الإرسال...' : 'إرسال طلب الدعم'}</button>
          <Link href={source === 'login' ? '/login' : '/dashboard'} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700">إلغاء</Link>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <div className="font-semibold text-slate-800">اشتراطات الإرسال</div>
          <ul className="mt-2 space-y-1">
            <li>• الاسم + رقم الهاتف + اسم القهوة أو الـ slug مطلوبة من صفحة الدخول.</li>
            <li>• في حال وجود رد أو متابعة سيتم التواصل معك عبر الهاتف.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
