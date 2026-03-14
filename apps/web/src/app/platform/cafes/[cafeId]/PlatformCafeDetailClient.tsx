'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  extractPlatformApiErrorMessage,
  isPlatformApiOk,
} from '@/lib/platform-auth/api';

type OwnerLabel = 'owner' | 'partner';
type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'suspended';
type PaymentState = 'paid_current' | 'trial_or_free' | 'overdue' | 'suspended';
type UsageState = 'active_now' | 'active_today' | 'active_recently' | 'inactive';

type OwnerRow = {
  id: string;
  full_name: string;
  phone: string;
  owner_label: OwnerLabel;
  is_active: boolean;
  created_at: string;
};

type SubscriptionRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  grace_days: number;
  status: SubscriptionStatus;
  effective_status: SubscriptionStatus;
  amount_paid: number;
  is_complimentary: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  countdown_seconds: number;
};

type OpenShift = {
  id: string;
  shift_kind: string;
  business_date: string;
  opened_at: string;
};

type CafeDetail = {
  generated_at: string;
  cafe: {
    id: string;
    slug: string;
    display_name: string;
    is_active: boolean;
    created_at: string;
    owner_count: number;
    active_owner_count: number;
    owners: OwnerRow[];
  };
  subscription: {
    current: SubscriptionRow | null;
    history: SubscriptionRow[];
  };
  activity: {
    last_activity_at: string | null;
    usage_state: UsageState;
    has_open_shift: boolean;
    open_shift: OpenShift | null;
    last_shift_closed_at: string | null;
  };
  billing_follow: {
    payment_state: PaymentState;
    current_subscription_effective_status: SubscriptionStatus | null;
    subscription_expires_at: string | null;
  };
  attention: {
    reasons: string[];
    scope: string;
  };
};

type DetailResponse = { ok: true; data: CafeDetail | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDetailResponse(value: unknown): value is DetailResponse {
  return isRecord(value) && value.ok === true;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function amountLabel(value: number | null | undefined) {
  const safe = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(safe);
}

function countdownLabel(totalSeconds: number) {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600);
  if (days > 0) return `${days} يوم و ${hours} ساعة`;
  const minutes = Math.floor((safe % 3600) / 60);
  return `${hours} ساعة و ${minutes} دقيقة`;
}

function reasonLabel(reason: string) {
  switch (reason) {
    case 'cafe_disabled':
      return 'القهوة معطلة';
    case 'no_active_owner':
      return 'لا يوجد مالك أو شريك نشط';
    case 'no_subscription':
      return 'لا يوجد اشتراك';
    case 'expired_but_active':
      return 'الاشتراك منتهي مع استمرار النشاط';
    case 'suspended_but_active':
      return 'الاشتراك معلق مع استمرار النشاط';
    case 'open_shift_too_long':
      return 'وردية مفتوحة مدة طويلة';
    case 'paid_but_inactive':
      return 'مدفوع لكن النشاط متوقف';
    default:
      return reason;
  }
}

function subscriptionBadgeClass(status: SubscriptionStatus) {
  switch (status) {
    case 'trial':
      return 'border-sky-200 bg-sky-50 text-sky-700';
    case 'active':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'expired':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'suspended':
      return 'border-rose-200 bg-rose-50 text-rose-700';
  }
}

function ownerLabelText(label: OwnerLabel) {
  return label === 'owner' ? 'مالك' : 'شريك';
}

function statusBadge(active: boolean) {
  return active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700';
}

function paymentLabel(state: PaymentState) {
  switch (state) {
    case 'paid_current':
      return 'مدفوع';
    case 'overdue':
      return 'متأخر';
    case 'suspended':
      return 'معلق';
    default:
      return 'تجريبي أو مجاني';
  }
}

function usageLabel(state: UsageState) {
  switch (state) {
    case 'active_now':
      return 'نشاط الآن';
    case 'active_today':
      return 'نشاط اليوم';
    case 'active_recently':
      return 'نشاط حديث';
    default:
      return 'غير نشطة';
  }
}

function toDateInputValue(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fromDateInputValue(value: string) {
  return new Date(`${value}T00:00:00`).toISOString();
}

export default function PlatformCafeDetailClient({ cafeId }: { cafeId: string }) {
  const today = useMemo(() => new Date(), []);
  const [data, setData] = useState<CafeDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createOwner, setCreateOwner] = useState({ fullName: '', phone: '', password: '', ownerLabel: 'partner' as OwnerLabel });
  const [editOwner, setEditOwner] = useState({ ownerUserId: '', fullName: '', phone: '', ownerLabel: 'partner' as OwnerLabel });
  const [resetPassword, setResetPassword] = useState({ ownerUserId: '', newPassword: '' });
  const [subscriptionForm, setSubscriptionForm] = useState({ startsAt: toDateInputValue(today), endsAt: toDateInputValue(new Date(today.getTime() + 1000 * 60 * 60 * 24 * 365)), graceDays: '0', status: 'active' as SubscriptionStatus, amountPaid: '', isComplimentary: false, notes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/platform/cafes/detail', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cafeId }),
        cache: 'no-store',
      });
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok || !isPlatformApiOk(json)) throw new Error(extractPlatformApiErrorMessage(json, 'LOAD_CAFE_DETAIL_FAILED'));
      setData(isDetailResponse(json) ? json.data : null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'LOAD_CAFE_DETAIL_FAILED');
    } finally {
      setLoading(false);
    }
  }, [cafeId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(url: string, body: Record<string, unknown>, successMessage: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok || !isPlatformApiOk(json)) throw new Error(extractPlatformApiErrorMessage(json, 'REQUEST_FAILED'));
      setNotice(successMessage);
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'REQUEST_FAILED');
    } finally {
      setBusy(false);
    }
  }

  function applySubscriptionPreset(days: number, status: SubscriptionStatus, isComplimentary = false) {
    const start = new Date();
    const end = new Date(start.getTime() + 1000 * 60 * 60 * 24 * days);
    setSubscriptionForm((value) => ({
      ...value,
      startsAt: toDateInputValue(start),
      endsAt: toDateInputValue(end),
      status,
      isComplimentary,
      amountPaid: isComplimentary ? '0' : value.amountPaid,
    }));
  }

  const cafe = data?.cafe;
  const currentSubscription = data?.subscription.current ?? null;

  if (loading && !data) {
    return <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-500">جارٍ تحميل التفاصيل...</div>;
  }

  if (!data || !cafe) {
    return <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-sm text-red-700">{error ?? 'تعذر تحميل تفاصيل القهوة.'}</div>;
  }

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</div> : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-bold text-slate-900">{cafe.display_name}</h2>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusBadge(cafe.is_active)}`}>{cafe.is_active ? 'مفعلة' : 'معطلة'}</span>
              {currentSubscription ? <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${subscriptionBadgeClass(currentSubscription.effective_status)}`}>{currentSubscription.effective_status}</span> : <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">بدون اشتراك</span>}
            </div>
            <div className="mt-2 text-sm text-slate-500">slug: {cafe.slug}</div>
            <div className="mt-1 text-sm text-slate-500">أُنشئت في {formatDateTime(cafe.created_at)}</div>
            <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-700">
              <span>الملاك/الشركاء: <strong>{cafe.owner_count}</strong></span>
              <span>النشطون: <strong>{cafe.active_owner_count}</strong></span>
              <span>آخر نشاط: <strong>{formatDateTime(data.activity.last_activity_at)}</strong></span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void load()} disabled={busy || loading} className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700">تحديث</button>
            <button type="button" onClick={() => void runAction('/api/platform/cafes/toggle', { cafeId, isActive: !cafe.is_active }, cafe.is_active ? 'تم تعطيل القهوة.' : 'تم تفعيل القهوة.')} disabled={busy || loading} className={`rounded-2xl px-4 py-2 text-sm font-medium text-white ${cafe.is_active ? 'bg-rose-600' : 'bg-emerald-600'} disabled:opacity-60`}>
              {cafe.is_active ? 'تعطيل القهوة' : 'تفعيل القهوة'}
            </button>
            <Link href="/platform" className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700">لوحة المنصة</Link>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-4">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900">الحالة المالية</h3>
          <div className="mt-4 text-sm text-slate-700">{paymentLabel(data.billing_follow.payment_state)}</div>
          <div className="mt-2 text-xs text-slate-500">ينتهي في {formatDateTime(data.billing_follow.subscription_expires_at)}</div>
        </section>
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900">النشاط</h3>
          <div className="mt-4 text-sm text-slate-700">{usageLabel(data.activity.usage_state)}</div>
          <div className="mt-2 text-xs text-slate-500">آخر نشاط {formatDateTime(data.activity.last_activity_at)}</div>
        </section>
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900">الورديات</h3>
          <div className="mt-4 text-sm text-slate-700">{data.activity.has_open_shift ? 'يوجد وردية مفتوحة' : 'لا توجد وردية مفتوحة'}</div>
          <div className="mt-2 text-xs text-slate-500">آخر قفل وردية {formatDateTime(data.activity.last_shift_closed_at)}</div>
        </section>
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900">الاشتراك الحالي</h3>
          {currentSubscription ? (
            <>
              <div className="mt-4 text-sm text-slate-700">{countdownLabel(currentSubscription.countdown_seconds)}</div>
              <div className="mt-2 text-xs text-slate-500">من {formatDateTime(currentSubscription.starts_at)} إلى {formatDateTime(currentSubscription.ends_at)}</div>
              <div className="mt-2 text-xs text-slate-600">{currentSubscription.is_complimentary ? 'اشتراك مجاني / استثنائي' : `تم تحصيل ${amountLabel(currentSubscription.amount_paid)} ج.م`}</div>
            </>
          ) : <div className="mt-4 text-sm text-slate-500">لا يوجد اشتراك حالي.</div>}
        </section>
      </div>

      {data.activity.open_shift ? (
        <section className="rounded-3xl border border-sky-200 bg-sky-50 p-6 shadow-sm text-sm text-sky-800">
          وردية مفتوحة الآن: <strong>{data.activity.open_shift.shift_kind}</strong> • تاريخ التشغيل <strong>{data.activity.open_shift.business_date}</strong> • بدأت {formatDateTime(data.activity.open_shift.opened_at)}
        </section>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-bold text-slate-900">إشارات المتابعة</h3>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">{data.attention.scope}</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {data.attention.reasons.length ? data.attention.reasons.map((reason) => (
            <span key={reason} className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">{reasonLabel(reason)}</span>
          )) : <span className="text-sm text-slate-500">لا توجد إشارات حرجة الآن.</span>}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900">إضافة مالك أو شريك</h3>
          <div className="mt-4 space-y-3">
            <select className="w-full rounded-2xl border border-slate-200 px-4 py-3" value={createOwner.ownerLabel} onChange={(e) => setCreateOwner((v) => ({ ...v, ownerLabel: e.target.value === 'owner' ? 'owner' : 'partner' }))}>
              <option value="partner">شريك</option>
              <option value="owner">مالك</option>
            </select>
            <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" placeholder="الاسم" value={createOwner.fullName} onChange={(e) => setCreateOwner((v) => ({ ...v, fullName: e.target.value }))} />
            <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" placeholder="رقم الهاتف" value={createOwner.phone} onChange={(e) => setCreateOwner((v) => ({ ...v, phone: e.target.value }))} />
            <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" type="password" placeholder="الباسورد" value={createOwner.password} onChange={(e) => setCreateOwner((v) => ({ ...v, password: e.target.value }))} />
          </div>
          <button type="button" disabled={busy || loading} onClick={() => void runAction('/api/platform/owners/create', { cafeId, fullName: createOwner.fullName, phone: createOwner.phone, password: createOwner.password, ownerLabel: createOwner.ownerLabel }, 'تم إنشاء حساب المالك/الشريك.').then(() => setCreateOwner({ fullName: '', phone: '', password: '', ownerLabel: 'partner' }))} className="mt-4 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">إضافة الحساب</button>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900">الحسابات الحالية</h3>
          <div className="mt-4 space-y-3">
            {cafe.owners.map((owner) => (
              <div key={owner.id} className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-900">{owner.full_name}</div>
                    <div className="mt-1 text-xs text-slate-500">{owner.phone}</div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 font-semibold text-slate-700">{ownerLabelText(owner.owner_label)}</span>
                    <span className={`rounded-full border px-2 py-1 font-semibold ${statusBadge(owner.is_active)}`}>{owner.is_active ? 'نشط' : 'موقوف'}</span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setEditOwner({ ownerUserId: owner.id, fullName: owner.full_name, phone: owner.phone, ownerLabel: owner.owner_label })} className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">تجهيز للتعديل</button>
                  <button type="button" onClick={() => setResetPassword((v) => ({ ...v, ownerUserId: owner.id }))} className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">تجهيز لتغيير الباسورد</button>
                  <button type="button" disabled={busy || loading} onClick={() => void runAction('/api/platform/owners/toggle', { cafeId, ownerUserId: owner.id, isActive: !owner.is_active }, owner.is_active ? 'تم إيقاف الحساب.' : 'تم تفعيل الحساب.')} className={`rounded-2xl px-3 py-2 text-sm font-medium text-white ${owner.is_active ? 'bg-rose-600' : 'bg-emerald-600'} disabled:opacity-60`}>
                    {owner.is_active ? 'إيقاف' : 'تفعيل'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900">تعديل حساب</h3>
          <div className="mt-4 grid gap-3">
            <select className="rounded-2xl border border-slate-200 px-4 py-3" value={editOwner.ownerUserId} onChange={(e) => {
              const found = cafe.owners.find((item) => item.id === e.target.value);
              setEditOwner(found ? { ownerUserId: found.id, fullName: found.full_name, phone: found.phone, ownerLabel: found.owner_label } : { ownerUserId: '', fullName: '', phone: '', ownerLabel: 'partner' });
            }}>
              <option value="">اختر الحساب</option>
              {cafe.owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.full_name}</option>)}
            </select>
            <select className="rounded-2xl border border-slate-200 px-4 py-3" value={editOwner.ownerLabel} onChange={(e) => setEditOwner((v) => ({ ...v, ownerLabel: e.target.value === 'owner' ? 'owner' : 'partner' }))}>
              <option value="partner">شريك</option>
              <option value="owner">مالك</option>
            </select>
            <input className="rounded-2xl border border-slate-200 px-4 py-3" placeholder="الاسم" value={editOwner.fullName} onChange={(e) => setEditOwner((v) => ({ ...v, fullName: e.target.value }))} />
            <input className="rounded-2xl border border-slate-200 px-4 py-3" placeholder="رقم الهاتف" value={editOwner.phone} onChange={(e) => setEditOwner((v) => ({ ...v, phone: e.target.value }))} />
          </div>
          <button type="button" disabled={busy || !editOwner.ownerUserId} onClick={() => void runAction('/api/platform/owners/update', { cafeId, ownerUserId: editOwner.ownerUserId, fullName: editOwner.fullName, phone: editOwner.phone, ownerLabel: editOwner.ownerLabel }, 'تم تحديث بيانات الحساب.')} className="mt-4 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">حفظ التعديل</button>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900">إعادة تعيين باسورد المالك</h3>
          <div className="mt-4 grid gap-3">
            <select className="rounded-2xl border border-slate-200 px-4 py-3" value={resetPassword.ownerUserId} onChange={(e) => setResetPassword((v) => ({ ...v, ownerUserId: e.target.value }))}>
              <option value="">اختر الحساب</option>
              {cafe.owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.full_name}</option>)}
            </select>
            <input className="rounded-2xl border border-slate-200 px-4 py-3" type="password" placeholder="الباسورد الجديد" value={resetPassword.newPassword} onChange={(e) => setResetPassword((v) => ({ ...v, newPassword: e.target.value }))} />
          </div>
          <button type="button" disabled={busy || !resetPassword.ownerUserId || !resetPassword.newPassword} onClick={() => void runAction('/api/platform/owners/reset-password', { cafeId, ownerUserId: resetPassword.ownerUserId, newPassword: resetPassword.newPassword }, 'تم تغيير الباسورد.').then(() => setResetPassword({ ownerUserId: '', newPassword: '' }))} className="mt-4 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">تغيير الباسورد</button>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900">إدارة الاشتراك</h3>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => applySubscriptionPreset(30, 'trial', true)} className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">30 يوم مجاني</button>
            <button type="button" onClick={() => applySubscriptionPreset(365, 'active')} className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">سنة مدفوعة</button>
            <button type="button" onClick={() => applySubscriptionPreset(30, 'active')} className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">شهر مدفوع</button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input type="date" className="rounded-2xl border border-slate-200 px-4 py-3" value={subscriptionForm.startsAt} onChange={(e) => setSubscriptionForm((v) => ({ ...v, startsAt: e.target.value }))} />
            <input type="date" className="rounded-2xl border border-slate-200 px-4 py-3" value={subscriptionForm.endsAt} onChange={(e) => setSubscriptionForm((v) => ({ ...v, endsAt: e.target.value }))} />
            <input className="rounded-2xl border border-slate-200 px-4 py-3" placeholder="أيام السماح" value={subscriptionForm.graceDays} onChange={(e) => setSubscriptionForm((v) => ({ ...v, graceDays: e.target.value }))} />
            <select className="rounded-2xl border border-slate-200 px-4 py-3" value={subscriptionForm.status} onChange={(e) => setSubscriptionForm((v) => ({ ...v, status: e.target.value as SubscriptionStatus }))}>
              <option value="active">active</option>
              <option value="trial">trial</option>
              <option value="expired">expired</option>
              <option value="suspended">suspended</option>
            </select>
            <input className="rounded-2xl border border-slate-200 px-4 py-3" placeholder="القيمة المدفوعة" value={subscriptionForm.amountPaid} onChange={(e) => setSubscriptionForm((v) => ({ ...v, amountPaid: e.target.value }))} />
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
              <input type="checkbox" checked={subscriptionForm.isComplimentary} onChange={(e) => setSubscriptionForm((v) => ({ ...v, isComplimentary: e.target.checked, amountPaid: e.target.checked ? '0' : v.amountPaid }))} />
              مجاني / استثنائي
            </label>
            <textarea className="min-h-28 rounded-2xl border border-slate-200 px-4 py-3 md:col-span-2" placeholder="ملاحظات الاشتراك" value={subscriptionForm.notes} onChange={(e) => setSubscriptionForm((v) => ({ ...v, notes: e.target.value }))} />
          </div>
          <button type="button" disabled={busy || loading} onClick={() => void runAction('/api/platform/subscriptions/create', { cafeId, startsAt: fromDateInputValue(subscriptionForm.startsAt), endsAt: fromDateInputValue(subscriptionForm.endsAt), graceDays: Number(subscriptionForm.graceDays || '0'), status: subscriptionForm.status, amountPaid: Number(subscriptionForm.amountPaid || '0'), isComplimentary: subscriptionForm.isComplimentary, notes: subscriptionForm.notes.trim() || null }, 'تم تحديث بيانات الاشتراك.')} className="mt-4 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">حفظ الاشتراك</button>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900">سجل الاشتراكات</h3>
          <div className="mt-4 space-y-3">
            {data.subscription.history.map((subscription) => (
              <div key={subscription.id} className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`rounded-full border px-2 py-1 text-xs ${subscriptionBadgeClass(subscription.effective_status)}`}>{subscription.effective_status}</span>
                  <span className="text-xs text-slate-500">{countdownLabel(subscription.countdown_seconds)}</span>
                </div>
                <div className="mt-2">البداية: <strong>{formatDateTime(subscription.starts_at)}</strong></div>
                <div className="mt-1">النهاية: <strong>{formatDateTime(subscription.ends_at)}</strong></div>
                <div className="mt-1">أيام السماح: <strong>{subscription.grace_days}</strong></div>
                <div className="mt-1">{subscription.is_complimentary ? 'مجاني / استثنائي' : `تم تحصيل ${amountLabel(subscription.amount_paid)} ج.م`}</div>
                {subscription.notes ? <div className="mt-2 text-xs text-slate-500">{subscription.notes}</div> : null}
              </div>
            ))}
            {data.subscription.history.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">لا يوجد سجل اشتراك حتى الآن.</div> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
