'use client';

import Link from 'next/link';
import { ownerAccountLabel, shiftRoleLabel } from '@/lib/ui/labels';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

type RuntimeMe = {
  tenantSlug?: string;
  tenantId?: string;
  fullName?: string;
  accountKind?: 'owner' | 'employee';
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
    requestAccess: false,
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
    if (runtimeMe.accountKind === 'owner') return ownerAccountLabel(runtimeMe.ownerLabel);
    if (runtimeMe.shiftRole === 'supervisor') return shiftRoleLabel(runtimeMe.shiftRole, 'person');
    if (runtimeMe.shiftRole === 'barista') return shiftRoleLabel(runtimeMe.shiftRole, 'person');
    if (runtimeMe.shiftRole === 'shisha') return shiftRoleLabel(runtimeMe.shiftRole, 'person');
    if (runtimeMe.shiftRole === 'waiter') return shiftRoleLabel(runtimeMe.shiftRole, 'person');
    return 'مستخدم داخل النظام';
  }, [runtimeMe]);

  const canRequestSupportAccess = useMemo(() => {
    if (source !== 'in_app') return false;
    if (!runtimeMe?.tenantId) return false;
    return runtimeMe.accountKind === 'owner' || runtimeMe.shiftRole === 'supervisor';
  }, [runtimeMe, source]);

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
          requestAccess: canRequestSupportAccess ? form.requestAccess : false,
          pagePath: source === 'in_app' ? (searchParams.get('page') || pathname) : '/login',
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(json?.error?.message || 'تعذر إرسال الرسالة الآن.');
      }
      const accessRequested = Boolean(json?.data?.supportAccessRequested);
      setNotice(
        accessRequested
          ? 'تم تسجيل طلب الدعم مع طلب وصول مؤقت كامل إلى القهوة. سيقوم فريق الدعم بمراجعته وتفعيله عند الحاجة.'
          : 'تم تسجيل الطلب بنجاح، وسيتم التواصل معك عبر الهاتف في أقرب وقت.',
      );
      setForm((value) => ({ ...value, message: '', requestAccess: false }));
      if (source === 'login') setDismissed(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'تعذر إرسال الرسالة الآن.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ahwa-page-shell p-4" dir="rtl">
      <div className="ahwa-card mx-auto max-w-2xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#1e1712]">مركز الدعم</h1>
            <p className="mt-1 text-sm text-[#8a7763]">
              {source === 'login'
                ? 'أرسل تفاصيل الطلب بوضوح، وسيتم التواصل معك عبر الهاتف في أقرب وقت.'
                : 'أرسل طلب الدعم من داخل النظام، وسنرفق بيانات التشغيل الحالية تلقائيًا متى أمكن.'}
            </p>
          </div>
          <Link href={source === 'login' ? '/login' : '/dashboard'} className="rounded-2xl border border-[#decdb9] px-4 py-2 text-sm font-medium text-[#5e4d3f]">عودة</Link>
        </div>

        {notice ? <div className="ahwa-alert-success mt-4">{notice}</div> : null}
        {error ? <div className="ahwa-alert-danger mt-4">{error}</div> : null}
        {dismissed && source === 'login' ? <div className="ahwa-card-soft mt-4 p-4 text-sm text-[#746353]">يمكنك العودة إلى صفحة الدخول أو إرسال طلب جديد متى احتجت.</div> : null}

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <input className="ahwa-input" placeholder="الاسم" value={form.senderName} onChange={(e) => setForm((v) => ({ ...v, senderName: e.target.value }))} />
          <input className="ahwa-input" placeholder="رقم الهاتف" value={form.senderPhone} onChange={(e) => setForm((v) => ({ ...v, senderPhone: e.target.value }))} />
          <input className="ahwa-input" placeholder="اسم القهوة" value={form.cafeName} onChange={(e) => setForm((v) => ({ ...v, cafeName: e.target.value }))} />
          <input className="ahwa-input" placeholder="معرّف القهوة (slug)" value={form.cafeSlug} onChange={(e) => setForm((v) => ({ ...v, cafeSlug: e.target.value }))} />
          <select className="ahwa-select md:col-span-2" value={form.issueType} onChange={(e) => setForm((v) => ({ ...v, issueType: e.target.value }))}>
            {issueOptions(source).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <textarea className="ahwa-textarea min-h-36 md:col-span-2" placeholder="اكتب تفاصيل المشكلة أو الطلب بوضوح" value={form.message} onChange={(e) => setForm((v) => ({ ...v, message: e.target.value }))} />
        </div>

        {source === 'in_app' && actorLabel ? (
          <div className="ahwa-alert-info mt-4">
            سيتم إرسال هذا الطلب بصفة <span className="font-semibold">{actorLabel}</span>
            {runtimeMe?.tenantSlug ? <> داخل قهوة <span className="font-semibold">{runtimeMe.tenantSlug}</span></> : null}.
          </div>
        ) : null}

        {canRequestSupportAccess ? (
          <label className="mt-4 flex items-start gap-3 rounded-[22px] border border-[#ecd9bd] bg-[#fcf3e7] p-4 text-sm text-[#774c10]">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={form.requestAccess}
              onChange={(event) => setForm((value) => ({ ...value, requestAccess: event.target.checked }))}
            />
            <span>
              أطلب فتح وصول دعم مؤقت كامل لهذه القهوة لهذه الرسالة فقط.
              <span className="mt-1 block text-xs text-[#8a5a18]">
                هذا لا يمنح وصولًا دائمًا، بل يفعّل وصولًا مؤقتًا ومقيّدًا عند موافقة الدعم ولمدة محددة أو حتى إغلاق البلاغ.
              </span>
            </span>
          </label>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <button disabled={busy} onClick={submit} className="ahwa-btn-primary px-5 disabled:opacity-60">{busy ? 'يتم الإرسال...' : 'إرسال الطلب'}</button>
          <Link href={source === 'login' ? '/login' : '/dashboard'} className="ahwa-btn-secondary px-5">تراجع</Link>
        </div>

        <div className="ahwa-card-soft mt-6 p-4 text-sm text-[#746353]">
          <div className="font-semibold text-[#2f241b]">قبل الإرسال</div>
          <ul className="mt-2 space-y-1">
            <li>• من صفحة الدخول نحتاج الاسم ورقم الهاتف واسم القهوة أو معرّفها.</li>
            <li>• في حال وجود متابعة سيتم التواصل معك عبر الهاتف.</li>
            <li>• طلب الوصول المؤقت الكامل يظهر فقط من داخل القهوة للمالك أو مشرف التشغيل.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
