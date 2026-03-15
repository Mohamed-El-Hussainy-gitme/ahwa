'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  extractPlatformApiErrorMessage,
  isPlatformApiOk,
} from '@/lib/platform-auth/api';

type OwnerLabel = 'owner' | 'partner';
type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'suspended';
type PaymentState = 'paid_current' | 'trial_or_free' | 'overdue' | 'suspended';
type UsageState = 'active_now' | 'active_today' | 'active_recently' | 'inactive';
type DetailTab = 'summary' | 'owners' | 'subscription' | 'support';

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

type SupportItem = {
  id: string;
  sender_name: string;
  sender_phone: string;
  issue_type: string;
  status: string;
  message: string;
  created_at: string;
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
  return new Intl.NumberFormat('ar-EG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

function countdownLabel(totalSeconds: number | null | undefined) {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(Number(totalSeconds))) : 0;
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

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${active ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'}`}
    >
      {label}
    </button>
  );
}

function StatCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-bold text-slate-900">{value}</div>
      {helper ? <div className="mt-2 text-xs text-slate-500">{helper}</div> : null}
    </div>
  );
}

function SectionFrame({ title, description, children, actions }: { title: string; description?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function PlatformCafeDetailClient({ cafeId }: { cafeId: string }) {
  const today = useMemo(() => new Date(), []);
  const [activeTab, setActiveTab] = useState<DetailTab>('summary');
  const [data, setData] = useState<CafeDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createOwner, setCreateOwner] = useState({ fullName: '', phone: '', password: '', ownerLabel: 'partner' as OwnerLabel });
  const [selectedOwnerId, setSelectedOwnerId] = useState('');
  const [editOwner, setEditOwner] = useState({ ownerUserId: '', fullName: '', phone: '', ownerLabel: 'partner' as OwnerLabel });
  const [resetPassword, setResetPassword] = useState({ ownerUserId: '', newPassword: '' });
  const [subscriptionForm, setSubscriptionForm] = useState({ startsAt: toDateInputValue(today), endsAt: toDateInputValue(new Date(today.getTime() + 1000 * 60 * 60 * 24 * 365)), graceDays: '0', status: 'active' as SubscriptionStatus, amountPaid: '', isComplimentary: false, notes: '' });
  const [supportItems, setSupportItems] = useState<SupportItem[]>([]);

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

  useEffect(() => {
    let active = true;
    fetch(`/api/platform/support/messages?cafeId=${cafeId}&limit=8`, { cache: 'no-store' })
      .then(async (res) => {
        const json: unknown = await res.json().catch(() => ({}));
        if (!res.ok || !isPlatformApiOk(json)) return;
        const rows = Array.isArray((json as { data?: { items?: unknown[] } }).data?.items)
          ? (((json as { data?: { items?: SupportItem[] } }).data?.items) ?? [])
          : [];
        if (active) setSupportItems(rows);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [cafeId, busy]);

  useEffect(() => {
    if (!data) return;
    const firstOwner = data.cafe.owners[0]?.id ?? '';
    setSelectedOwnerId((current) => {
      const nextId = data.cafe.owners.some((owner) => owner.id === current) ? current : firstOwner;
      const selected = data.cafe.owners.find((owner) => owner.id === nextId);
      setEditOwner(selected ? { ownerUserId: selected.id, fullName: selected.full_name, phone: selected.phone, ownerLabel: selected.owner_label } : { ownerUserId: '', fullName: '', phone: '', ownerLabel: 'partner' });
      setResetPassword((value) => ({ ...value, ownerUserId: selected?.id ?? '' }));
      return nextId;
    });
  }, [data]);

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
  const selectedOwner = cafe?.owners.find((owner) => owner.id === selectedOwnerId) ?? null;

  if (loading && !data) {
    return <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-500">جارٍ تحميل التفاصيل...</div>;
  }

  if (!data || !cafe) {
    return <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-sm text-red-700">{error ?? 'تعذر تحميل تفاصيل القهوة.'}</div>;
  }

  const supportPreview = supportItems.slice(0, 3);

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</div> : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-bold text-slate-900">{cafe.display_name}</h2>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusBadge(cafe.is_active)}`}>{cafe.is_active ? 'مفعلة' : 'معطلة'}</span>
              {currentSubscription ? <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${subscriptionBadgeClass(currentSubscription.effective_status)}`}>{currentSubscription.effective_status}</span> : <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">بدون اشتراك</span>}
            </div>
            <div className="text-sm text-slate-500">slug: {cafe.slug}</div>
            <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 px-4 py-3">الملاك/الشركاء: <strong>{cafe.owner_count}</strong></div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">النشطون: <strong>{cafe.active_owner_count}</strong></div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">آخر نشاط: <strong>{formatDateTime(data.activity.last_activity_at)}</strong></div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">آخر تحديث: <strong>{formatDateTime(data.generated_at)}</strong></div>
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

        <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-5">
          <TabButton active={activeTab === 'summary'} label="الملخص" onClick={() => setActiveTab('summary')} />
          <TabButton active={activeTab === 'owners'} label="الملاك" onClick={() => setActiveTab('owners')} />
          <TabButton active={activeTab === 'subscription'} label="الاشتراك" onClick={() => setActiveTab('subscription')} />
          <TabButton active={activeTab === 'support'} label="الدعم الفني" onClick={() => setActiveTab('support')} />
        </div>
      </section>

      {activeTab === 'summary' ? (
        <div className="space-y-6">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="الحالة المالية" value={paymentLabel(data.billing_follow.payment_state)} helper={currentSubscription ? countdownLabel(currentSubscription.countdown_seconds) : 'لا يوجد اشتراك حالي'} />
            <StatCard label="النشاط" value={usageLabel(data.activity.usage_state)} helper={`آخر نشاط ${formatDateTime(data.activity.last_activity_at)}`} />
            <StatCard label="الورديات" value={data.activity.has_open_shift ? 'يوجد وردية مفتوحة' : 'لا توجد وردية مفتوحة'} helper={`آخر قفل ${formatDateTime(data.activity.last_shift_closed_at)}`} />
            <StatCard label="الاشتراك الحالي" value={currentSubscription ? (currentSubscription.is_complimentary ? 'مجاني / استثنائي' : `${amountLabel(currentSubscription.amount_paid)} ج.م`) : 'بدون اشتراك'} helper={currentSubscription ? `ينتهي ${formatDateTime(currentSubscription.ends_at)}` : 'يحتاج إلى تفعيل'} />
          </section>

          {data.activity.open_shift ? (
            <SectionFrame title="الوردية المفتوحة" description="ملخص سريع عن حالة التشغيل الحالية لهذه القهوة.">
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
                وردية مفتوحة الآن: <strong>{data.activity.open_shift.shift_kind}</strong> • تاريخ التشغيل <strong>{data.activity.open_shift.business_date}</strong> • بدأت {formatDateTime(data.activity.open_shift.opened_at)}
              </div>
            </SectionFrame>
          ) : null}

          <SectionFrame title="إشارات المتابعة" description="تنبيهات إدارية سريعة بدون الدخول في تفاصيل تشغيلية حساسة.">
            <div className="flex flex-wrap gap-2">
              {data.attention.reasons.length ? data.attention.reasons.map((reason) => (
                <span key={reason} className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">{reasonLabel(reason)}</span>
              )) : <span className="text-sm text-slate-500">لا توجد إشارات حرجة الآن.</span>}
            </div>
          </SectionFrame>

          <SectionFrame title="آخر رسائل الدعم الفني" description="ملخص مختصر قبل الدخول إلى تبويب الدعم الفني." actions={<button type="button" onClick={() => setActiveTab('support')} className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700">فتح تبويب الدعم</button>}>
            <div className="space-y-3">
              {supportPreview.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-700">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">{item.issue_type}</span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs">{item.status}</span>
                    <span className="text-xs text-slate-500">{formatDateTime(item.created_at)}</span>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">{item.sender_name} — {item.sender_phone}</div>
                  <div className="mt-3 rounded-2xl bg-slate-50 p-3">{item.message}</div>
                </div>
              ))}
              {supportPreview.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">لا توجد رسائل دعم مرتبطة بهذه القهوة حتى الآن.</div> : null}
            </div>
          </SectionFrame>
        </div>
      ) : null}

      {activeTab === 'owners' ? (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_1.8fr]">
          <SectionFrame title="الحسابات الحالية" description="اختر حسابًا واحدًا لإدارته من اللوحة الجانبية بدون أزرار مكررة داخل كل بطاقة.">
            <div className="space-y-3">
              {cafe.owners.map((owner) => {
                const isSelected = owner.id === selectedOwnerId;
                return (
                  <button
                    key={owner.id}
                    type="button"
                    onClick={() => {
                      setSelectedOwnerId(owner.id);
                      setEditOwner({ ownerUserId: owner.id, fullName: owner.full_name, phone: owner.phone, ownerLabel: owner.owner_label });
                      setResetPassword((value) => ({ ...value, ownerUserId: owner.id }));
                    }}
                    className={`w-full rounded-2xl border p-4 text-right transition ${isSelected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className={`font-semibold ${isSelected ? 'text-white' : 'text-slate-900'}`}>{owner.full_name}</div>
                        <div className={`mt-1 text-xs ${isSelected ? 'text-slate-200' : 'text-slate-500'}`}>{owner.phone}</div>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className={`rounded-full border px-2 py-1 font-semibold ${isSelected ? 'border-white/20 bg-white/10 text-white' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>{ownerLabelText(owner.owner_label)}</span>
                        <span className={`rounded-full border px-2 py-1 font-semibold ${isSelected ? 'border-white/20 bg-white/10 text-white' : statusBadge(owner.is_active)}`}>{owner.is_active ? 'نشط' : 'موقوف'}</span>
                      </div>
                    </div>
                    <div className={`mt-3 text-xs ${isSelected ? 'text-slate-200' : 'text-slate-500'}`}>أُنشئ في {formatDateTime(owner.created_at)}</div>
                  </button>
                );
              })}
            </div>
          </SectionFrame>

          <div className="space-y-6">
            <SectionFrame title="إضافة مالك أو شريك" description="استخدم هذا النموذج فقط عند إنشاء حساب جديد للقهوة الحالية.">
              <div className="grid gap-3 md:grid-cols-2">
                <select className="rounded-2xl border border-slate-200 px-4 py-3" value={createOwner.ownerLabel} onChange={(e) => setCreateOwner((v) => ({ ...v, ownerLabel: e.target.value === 'owner' ? 'owner' : 'partner' }))}>
                  <option value="partner">شريك</option>
                  <option value="owner">مالك</option>
                </select>
                <input className="rounded-2xl border border-slate-200 px-4 py-3" placeholder="الاسم" value={createOwner.fullName} onChange={(e) => setCreateOwner((v) => ({ ...v, fullName: e.target.value }))} />
                <input className="rounded-2xl border border-slate-200 px-4 py-3" placeholder="رقم الهاتف" value={createOwner.phone} onChange={(e) => setCreateOwner((v) => ({ ...v, phone: e.target.value }))} />
                <input className="rounded-2xl border border-slate-200 px-4 py-3" type="password" placeholder="الباسورد" value={createOwner.password} onChange={(e) => setCreateOwner((v) => ({ ...v, password: e.target.value }))} />
              </div>
              <div className="mt-4">
                <button type="button" disabled={busy || loading} onClick={() => void runAction('/api/platform/owners/create', { cafeId, fullName: createOwner.fullName, phone: createOwner.phone, password: createOwner.password, ownerLabel: createOwner.ownerLabel }, 'تم إنشاء حساب المالك/الشريك.').then(() => setCreateOwner({ fullName: '', phone: '', password: '', ownerLabel: 'partner' }))} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">إضافة الحساب</button>
              </div>
            </SectionFrame>

            <SectionFrame title="إدارة الحساب المحدد" description={selectedOwner ? `الحساب المحدد الآن: ${selectedOwner.full_name}` : 'اختر حسابًا من القائمة أولًا.'} actions={selectedOwner ? <button type="button" disabled={busy || loading} onClick={() => void runAction('/api/platform/owners/toggle', { cafeId, ownerUserId: selectedOwner.id, isActive: !selectedOwner.is_active }, selectedOwner.is_active ? 'تم إيقاف الحساب.' : 'تم تفعيل الحساب.')} className={`rounded-2xl px-4 py-2 text-sm font-medium text-white ${selectedOwner.is_active ? 'bg-rose-600' : 'bg-emerald-600'} disabled:opacity-60`}>{selectedOwner.is_active ? 'إيقاف الحساب' : 'تفعيل الحساب'}</button> : null}>
              {selectedOwner ? (
                <div className="space-y-6">
                  <div className="grid gap-3 md:grid-cols-2">
                    <select className="rounded-2xl border border-slate-200 px-4 py-3" value={editOwner.ownerLabel} onChange={(e) => setEditOwner((v) => ({ ...v, ownerLabel: e.target.value === 'owner' ? 'owner' : 'partner' }))}>
                      <option value="partner">شريك</option>
                      <option value="owner">مالك</option>
                    </select>
                    <input className="rounded-2xl border border-slate-200 px-4 py-3" placeholder="الاسم" value={editOwner.fullName} onChange={(e) => setEditOwner((v) => ({ ...v, fullName: e.target.value }))} />
                    <input className="rounded-2xl border border-slate-200 px-4 py-3 md:col-span-2" placeholder="رقم الهاتف" value={editOwner.phone} onChange={(e) => setEditOwner((v) => ({ ...v, phone: e.target.value }))} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={busy || !editOwner.ownerUserId} onClick={() => void runAction('/api/platform/owners/update', { cafeId, ownerUserId: editOwner.ownerUserId, fullName: editOwner.fullName, phone: editOwner.phone, ownerLabel: editOwner.ownerLabel }, 'تم تحديث بيانات الحساب.')} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">حفظ التعديل</button>
                  </div>
                  <div className="grid gap-3 border-t border-slate-100 pt-5 md:grid-cols-[1.2fr_auto] md:items-end">
                    <input className="rounded-2xl border border-slate-200 px-4 py-3" type="password" placeholder="الباسورد الجديد" value={resetPassword.newPassword} onChange={(e) => setResetPassword((v) => ({ ...v, newPassword: e.target.value }))} />
                    <button type="button" disabled={busy || !resetPassword.ownerUserId || !resetPassword.newPassword} onClick={() => void runAction('/api/platform/owners/reset-password', { cafeId, ownerUserId: resetPassword.ownerUserId, newPassword: resetPassword.newPassword }, 'تم تغيير الباسورد.').then(() => setResetPassword({ ownerUserId: selectedOwner.id, newPassword: '' }))} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">تغيير الباسورد</button>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">اختر حسابًا من القائمة اليسرى لعرض خيارات الإدارة.</div>
              )}
            </SectionFrame>
          </div>
        </div>
      ) : null}

      {activeTab === 'subscription' ? (
        <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
          <SectionFrame title="إدارة الاشتراك" description="بطاقة واحدة للتعديل والتجديد بدل تكرار الأزرار عبر الصفحة." actions={<div className="flex flex-wrap gap-2"><button type="button" onClick={() => applySubscriptionPreset(30, 'trial', true)} className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">30 يوم مجاني</button><button type="button" onClick={() => applySubscriptionPreset(365, 'active')} className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">سنة مدفوعة</button><button type="button" onClick={() => applySubscriptionPreset(30, 'active')} className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">شهر مدفوع</button></div>}>
            <div className="grid gap-3 md:grid-cols-2">
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
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={busy || loading} onClick={() => void runAction('/api/platform/subscriptions/create', { cafeId, startsAt: fromDateInputValue(subscriptionForm.startsAt), endsAt: fromDateInputValue(subscriptionForm.endsAt), graceDays: Number(subscriptionForm.graceDays || '0'), status: subscriptionForm.status, amountPaid: Number(subscriptionForm.amountPaid || '0'), isComplimentary: subscriptionForm.isComplimentary, notes: subscriptionForm.notes.trim() || null }, 'تم تحديث بيانات الاشتراك.')} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">حفظ الاشتراك</button>
            </div>
          </SectionFrame>

          <div className="space-y-6">
            <SectionFrame title="الحالة الحالية" description="ملخص سريع لحالة الاشتراك الفعلية الآن.">
              {currentSubscription ? (
                <div className="space-y-3 text-sm text-slate-700">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${subscriptionBadgeClass(currentSubscription.effective_status)}`}>{currentSubscription.effective_status}</span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">{countdownLabel(currentSubscription.countdown_seconds)}</span>
                  </div>
                  <div>الفترة: <strong>{formatDateTime(currentSubscription.starts_at)}</strong> إلى <strong>{formatDateTime(currentSubscription.ends_at)}</strong></div>
                  <div>التحصيل: <strong>{currentSubscription.is_complimentary ? 'مجاني / استثنائي' : `${amountLabel(currentSubscription.amount_paid)} ج.م`}</strong></div>
                  <div>أيام السماح: <strong>{currentSubscription.grace_days}</strong></div>
                  {currentSubscription.notes ? <div className="rounded-2xl bg-slate-50 p-3 text-slate-600">{currentSubscription.notes}</div> : null}
                </div>
              ) : <div className="text-sm text-slate-500">لا يوجد اشتراك حالي.</div>}
            </SectionFrame>

            <SectionFrame title="سجل الاشتراكات" description="التسلسل الزمني الكامل للاشتراكات بدون تكرار ملخصات غير لازمة.">
              <div className="space-y-3">
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
            </SectionFrame>
          </div>
        </div>
      ) : null}

      {activeTab === 'support' ? (
        <SectionFrame title="سجل الدعم الفني" description="جميع الرسائل المرتبطة بهذه القهوة في مكان واحد نظيف وواضح." actions={<Link href="/platform" className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700">فتح صندوق الدعم</Link>}>
          <div className="space-y-3">
            {supportItems.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-700">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{item.issue_type}</span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs">{item.status}</span>
                  <span className="text-xs text-slate-500">{formatDateTime(item.created_at)}</span>
                </div>
                <div className="mt-2 text-xs text-slate-500">{item.sender_name} — {item.sender_phone}</div>
                <div className="mt-3 rounded-2xl bg-slate-50 p-3">{item.message}</div>
              </div>
            ))}
            {supportItems.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">لا توجد رسائل دعم مرتبطة بهذه القهوة حتى الآن.</div> : null}
          </div>
        </SectionFrame>
      ) : null}
    </div>
  );
}
