'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  extractPlatformApiErrorMessage,
  isPlatformApiOk,
} from '@/lib/platform-auth/api';

type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'suspended';
type SubscriptionState = SubscriptionStatus | 'none';
type PaymentState = 'paid_current' | 'trial_or_free' | 'overdue' | 'suspended';
type UsageState = 'active_now' | 'active_today' | 'active_recently' | 'inactive';

type CafeSubscriptionRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  grace_days: number;
  status: SubscriptionStatus;
  effective_status: SubscriptionStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  countdown_seconds: number;
};

type PortfolioCafeRow = {
  id: string;
  slug: string;
  display_name: string;
  is_active: boolean;
  created_at: string;
  owner_count: number;
  active_owner_count: number;
  current_subscription: CafeSubscriptionRow | null;
  subscription_state: SubscriptionState;
  payment_state: PaymentState;
  usage_state: UsageState;
  last_activity_at: string | null;
  has_open_shift: boolean;
  open_shift_business_date: string | null;
  open_shift_started_at: string | null;
  usage_days_7: number;
  usage_days_30: number;
  shifts_today: number;
  sessions_today: number;
  served_qty_today: number;
  net_sales_today: number;
  remake_qty_today: number;
  cancelled_qty_today: number;
  complaints_today: number;
  open_complaints_count: number;
  active_staff_today: number;
  deferred_outstanding: number;
  attention_reasons: string[];
};

type AttentionCafeRow = {
  id: string;
  slug: string;
  display_name: string;
  usage_state: UsageState;
  payment_state: PaymentState;
  last_activity_at: string | null;
  attention_reasons: string[];
};

type PlatformDatabaseUsage = {
  used_bytes: number;
  used_pretty: string;
  capacity_bytes: number | null;
  capacity_pretty: string | null;
  usage_percent: number | null;
  database_name: string;
};

type PlatformOverviewSummary = {
  cafes_total: number;
  cafes_active: number;
  paid_current: number;
  trial_or_free: number;
  overdue: number;
  suspended: number;
  no_subscription: number;
  active_now: number;
  active_today: number;
  inactive: number;
  needs_attention: number;
  net_sales_today: number;
  served_qty_today: number;
  complaints_today: number;
};

type PlatformOverview = {
  generated_at: string;
  database_usage: PlatformDatabaseUsage;
  summary: PlatformOverviewSummary;
  cafes: PortfolioCafeRow[];
  attention_queue: AttentionCafeRow[];
};

type OverviewResponse = { ok: true; data: PlatformOverview | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return value === 'trial' || value === 'active' || value === 'expired' || value === 'suspended';
}

function isSubscriptionState(value: unknown): value is SubscriptionState {
  return value === 'none' || isSubscriptionStatus(value);
}

function isPaymentState(value: unknown): value is PaymentState {
  return value === 'paid_current' || value === 'trial_or_free' || value === 'overdue' || value === 'suspended';
}

function isUsageState(value: unknown): value is UsageState {
  return value === 'active_now' || value === 'active_today' || value === 'active_recently' || value === 'inactive';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isCafeSubscriptionRow(value: unknown): value is CafeSubscriptionRow {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.starts_at === 'string' &&
    typeof value.ends_at === 'string' &&
    typeof value.grace_days === 'number' &&
    isSubscriptionStatus(value.status) &&
    isSubscriptionStatus(value.effective_status) &&
    (typeof value.notes === 'string' || value.notes === null) &&
    typeof value.created_at === 'string' &&
    typeof value.updated_at === 'string' &&
    typeof value.countdown_seconds === 'number'
  );
}

function isPortfolioCafeRow(value: unknown): value is PortfolioCafeRow {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.slug === 'string' &&
    typeof value.display_name === 'string' &&
    typeof value.is_active === 'boolean' &&
    typeof value.created_at === 'string' &&
    typeof value.owner_count === 'number' &&
    typeof value.active_owner_count === 'number' &&
    (value.current_subscription === null || isCafeSubscriptionRow(value.current_subscription)) &&
    isSubscriptionState(value.subscription_state) &&
    isPaymentState(value.payment_state) &&
    isUsageState(value.usage_state) &&
    (typeof value.last_activity_at === 'string' || value.last_activity_at === null) &&
    typeof value.has_open_shift === 'boolean' &&
    (typeof value.open_shift_business_date === 'string' || value.open_shift_business_date === null) &&
    (typeof value.open_shift_started_at === 'string' || value.open_shift_started_at === null) &&
    typeof value.usage_days_7 === 'number' &&
    typeof value.usage_days_30 === 'number' &&
    typeof value.shifts_today === 'number' &&
    typeof value.sessions_today === 'number' &&
    typeof value.served_qty_today === 'number' &&
    typeof value.net_sales_today === 'number' &&
    typeof value.remake_qty_today === 'number' &&
    typeof value.cancelled_qty_today === 'number' &&
    typeof value.complaints_today === 'number' &&
    typeof value.open_complaints_count === 'number' &&
    typeof value.active_staff_today === 'number' &&
    typeof value.deferred_outstanding === 'number' &&
    isStringArray(value.attention_reasons)
  );
}

function isAttentionCafeRow(value: unknown): value is AttentionCafeRow {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.slug === 'string' &&
    typeof value.display_name === 'string' &&
    isUsageState(value.usage_state) &&
    isPaymentState(value.payment_state) &&
    (typeof value.last_activity_at === 'string' || value.last_activity_at === null) &&
    isStringArray(value.attention_reasons)
  );
}

function isPlatformDatabaseUsage(value: unknown): value is PlatformDatabaseUsage {
  return (
    isRecord(value) &&
    typeof value.used_bytes === 'number' &&
    typeof value.used_pretty === 'string' &&
    (typeof value.capacity_bytes === 'number' || value.capacity_bytes === null) &&
    (typeof value.capacity_pretty === 'string' || value.capacity_pretty === null) &&
    (typeof value.usage_percent === 'number' || value.usage_percent === null) &&
    typeof value.database_name === 'string'
  );
}

function isPlatformOverviewSummary(value: unknown): value is PlatformOverviewSummary {
  return (
    isRecord(value) &&
    typeof value.cafes_total === 'number' &&
    typeof value.cafes_active === 'number' &&
    typeof value.paid_current === 'number' &&
    typeof value.trial_or_free === 'number' &&
    typeof value.overdue === 'number' &&
    typeof value.suspended === 'number' &&
    typeof value.no_subscription === 'number' &&
    typeof value.active_now === 'number' &&
    typeof value.active_today === 'number' &&
    typeof value.inactive === 'number' &&
    typeof value.needs_attention === 'number' &&
    typeof value.net_sales_today === 'number' &&
    typeof value.served_qty_today === 'number' &&
    typeof value.complaints_today === 'number'
  );
}

function isPlatformOverview(value: unknown): value is PlatformOverview {
  return (
    isRecord(value) &&
    typeof value.generated_at === 'string' &&
    isPlatformDatabaseUsage(value.database_usage) &&
    isPlatformOverviewSummary(value.summary) &&
    Array.isArray(value.cafes) &&
    value.cafes.every(isPortfolioCafeRow) &&
    Array.isArray(value.attention_queue) &&
    value.attention_queue.every(isAttentionCafeRow)
  );
}

function isOverviewResponse(value: unknown): value is OverviewResponse {
  return isRecord(value) && value.ok === true && (value.data === null || isPlatformOverview(value.data));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(value ?? 0);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function badgeClassForPayment(state: PaymentState) {
  switch (state) {
    case 'paid_current': return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'overdue': return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'suspended': return 'border-rose-200 bg-rose-50 text-rose-700';
    default: return 'border-slate-200 bg-slate-50 text-slate-700';
  }
}

function badgeClassForUsage(state: UsageState) {
  switch (state) {
    case 'active_now': return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'active_today': return 'border-sky-200 bg-sky-50 text-sky-700';
    case 'active_recently': return 'border-violet-200 bg-violet-50 text-violet-700';
    default: return 'border-slate-200 bg-slate-50 text-slate-700';
  }
}

function paymentLabel(state: PaymentState) {
  switch (state) {
    case 'paid_current': return 'مدفوع حالي';
    case 'overdue': return 'منتهي/متأخر';
    case 'suspended': return 'معلق';
    default: return 'تجريبي/بدون اشتراك';
  }
}

function usageLabel(state: UsageState) {
  switch (state) {
    case 'active_now': return 'شغالة الآن';
    case 'active_today': return 'شغلت اليوم';
    case 'active_recently': return 'نشطة مؤخرًا';
    default: return 'خاملة';
  }
}

function attentionReasonLabel(reason: string) {
  switch (reason) {
    case 'cafe_disabled': return 'القهوة معطلة';
    case 'no_active_owner': return 'لا يوجد مالك/شريك نشط';
    case 'no_subscription': return 'لا يوجد اشتراك';
    case 'expired_but_active': return 'الاشتراك منتهي مع نشاط';
    case 'suspended_but_active': return 'الاشتراك معلق مع نشاط';
    case 'open_shift_too_long': return 'وردية مفتوحة مدة طويلة';
    case 'open_complaints': return 'شكاوى مفتوحة';
    case 'paid_but_inactive': return 'مدفوع لكن بدون استخدام';
    default: return reason;
  }
}

function toCapacityInput(bytes: number | null) {
  if (!bytes || bytes <= 0) return '';
  return String(Number((bytes / (1024 ** 3)).toFixed(2)));
}

export default function PlatformPortfolioOverview({
  selectedCafeId,
  onSelectCafe,
  refreshRevision,
}: {
  selectedCafeId: string;
  onSelectCafe: (cafeId: string) => void;
  refreshRevision: number;
}) {
  const [data, setData] = useState<PlatformOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingCapacity, setSavingCapacity] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [platformStatus, setPlatformStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | PaymentState | 'no_subscription'>('all');
  const [usageFilter, setUsageFilter] = useState<'all' | UsageState>('all');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [capacityInputGb, setCapacityInputGb] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/platform/overview', { cache: 'no-store' });
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok || !isPlatformApiOk(json)) {
        throw new Error(extractPlatformApiErrorMessage(json, 'LOAD_PLATFORM_OVERVIEW_FAILED'));
      }
      const overview = isOverviewResponse(json) ? json.data : null;
      setData(overview);
      setCapacityInputGb(toCapacityInput(overview?.database_usage.capacity_bytes ?? null));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'LOAD_PLATFORM_OVERVIEW_FAILED');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshRevision]);

  const filteredCafes = useMemo(() => {
    const items = data?.cafes ?? [];
    const query = search.trim().toLowerCase();
    return items.filter((cafe) => {
      if (platformStatus === 'active' && !cafe.is_active) return false;
      if (platformStatus === 'inactive' && cafe.is_active) return false;
      if (paymentFilter === 'no_subscription' && cafe.subscription_state !== 'none') return false;
      if (paymentFilter !== 'all' && paymentFilter !== 'no_subscription' && cafe.payment_state !== paymentFilter) return false;
      if (usageFilter !== 'all' && cafe.usage_state !== usageFilter) return false;
      if (attentionOnly && cafe.attention_reasons.length === 0) return false;
      if (!query) return true;
      return cafe.display_name.toLowerCase().includes(query) || cafe.slug.toLowerCase().includes(query);
    });
  }, [attentionOnly, data?.cafes, paymentFilter, platformStatus, search, usageFilter]);

  async function saveCapacity() {
    const trimmed = capacityInputGb.trim();
    const capacityBytes = trimmed
      ? Math.round(Number(trimmed) * 1024 * 1024 * 1024)
      : null;

    if (trimmed && (!Number.isFinite(Number(trimmed)) || Number(trimmed) <= 0)) {
      setError('اكتب سعة صحيحة بالجيجابايت أو اترك الحقل فارغًا لمسحها.');
      return;
    }

    setSavingCapacity(true);
    setError(null);
    try {
      const res = await fetch('/api/platform/settings/database-capacity', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ capacityBytes }),
      });
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok || !isPlatformApiOk(json)) {
        throw new Error(extractPlatformApiErrorMessage(json, 'SAVE_DATABASE_CAPACITY_FAILED'));
      }
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'SAVE_DATABASE_CAPACITY_FAILED');
    } finally {
      setSavingCapacity(false);
    }
  }

  const usage = data?.database_usage ?? null;
  const summary = data?.summary ?? null;
  const attentionQueue = data?.attention_queue ?? [];

  return (
    <section className="space-y-6">
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">نظرة عامة على المنصة</h2>
              <p className="mt-1 text-sm text-slate-500">استخدام حقيقي من قاعدة البيانات + حالة الاشتراك + حالة التشغيل.</p>
            </div>
            <button onClick={() => void load()} className="rounded-2xl border border-slate-300 px-3 py-2 text-sm" disabled={loading}>
              {loading ? 'جاري التحديث...' : 'تحديث'}
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs text-slate-500">إجمالي القهاوي</div><div className="mt-2 text-2xl font-bold">{summary?.cafes_total ?? 0}</div><div className="mt-1 text-xs text-slate-500">المفعلة: {summary?.cafes_active ?? 0}</div></div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><div className="text-xs text-emerald-700">المدفوع الحالي</div><div className="mt-2 text-2xl font-bold text-emerald-800">{summary?.paid_current ?? 0}</div><div className="mt-1 text-xs text-emerald-700">تجريبي/بدون اشتراك: {summary?.trial_or_free ?? 0}</div></div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="text-xs text-amber-700">متأخر أو منتهي</div><div className="mt-2 text-2xl font-bold text-amber-800">{summary?.overdue ?? 0}</div><div className="mt-1 text-xs text-amber-700">معلقة: {summary?.suspended ?? 0}</div></div>
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4"><div className="text-xs text-violet-700">يحتاج متابعة</div><div className="mt-2 text-2xl font-bold text-violet-800">{summary?.needs_attention ?? 0}</div><div className="mt-1 text-xs text-violet-700">شغالة الآن: {summary?.active_now ?? 0}</div></div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 p-4"><div className="text-xs text-slate-500">مبيعات اليوم</div><div className="mt-2 text-xl font-semibold">{formatMoney(summary?.net_sales_today ?? 0)} ج</div></div>
            <div className="rounded-2xl border border-slate-200 p-4"><div className="text-xs text-slate-500">المسلّم اليوم</div><div className="mt-2 text-xl font-semibold">{summary?.served_qty_today ?? 0}</div></div>
            <div className="rounded-2xl border border-slate-200 p-4"><div className="text-xs text-slate-500">شكاوى اليوم</div><div className="mt-2 text-xl font-semibold">{summary?.complaints_today ?? 0}</div></div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">استخدام قاعدة البيانات</h2>
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs text-slate-500">القاعدة الحالية</div>
              <div className="mt-2 text-lg font-semibold">{usage?.database_name ?? '—'}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="text-xs text-slate-500">المستخدم فعليًا من قاعدة البيانات</div>
              <div className="mt-2 text-2xl font-bold">{usage?.used_pretty ?? '—'}</div>
              <div className="mt-1 text-xs text-slate-500">{typeof usage?.used_bytes === 'number' ? `${usage.used_bytes.toLocaleString('en-US')} bytes` : '—'}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="text-xs text-slate-500">السعة المرجعية المخزنة في الداتابيز</div>
              <div className="mt-2 text-xl font-semibold">{usage?.capacity_pretty ?? 'غير محددة بعد'}</div>
              <div className="mt-1 text-xs text-slate-500">{usage?.usage_percent == null ? 'أضف السعة ليظهر الاستهلاك النسبي.' : `الاستهلاك الحالي ${usage.usage_percent}%`}</div>
            </div>
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-medium">تحديث السعة المرجعية</div>
              <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" inputMode="decimal" placeholder="السعة بالجيجابايت مثل 8" value={capacityInputGb} onChange={(e) => setCapacityInputGb(e.target.value)} />
              <button onClick={saveCapacity} disabled={savingCapacity} className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-white disabled:opacity-60">{savingCapacity ? 'جارٍ الحفظ...' : 'حفظ السعة المرجعية'}</button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">فلترة محفظة القهاوي</h2>
          <div className="mt-4 grid gap-3 lg:grid-cols-5">
            <input className="rounded-2xl border border-slate-200 px-4 py-3 lg:col-span-2" placeholder="ابحث باسم القهوة أو الـ slug" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="rounded-2xl border border-slate-200 px-4 py-3" value={platformStatus} onChange={(e) => setPlatformStatus(e.target.value as 'all' | 'active' | 'inactive')}>
              <option value="all">كل القهاوي</option>
              <option value="active">المفعلة فقط</option>
              <option value="inactive">المعطلة فقط</option>
            </select>
            <select className="rounded-2xl border border-slate-200 px-4 py-3" value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value as 'all' | PaymentState | 'no_subscription')}>
              <option value="all">كل الاشتراكات</option>
              <option value="paid_current">المدفوع الحالي</option>
              <option value="trial_or_free">تجريبي/مجاني</option>
              <option value="overdue">منتهي/متأخر</option>
              <option value="suspended">معلق</option>
              <option value="no_subscription">بدون اشتراك</option>
            </select>
            <select className="rounded-2xl border border-slate-200 px-4 py-3" value={usageFilter} onChange={(e) => setUsageFilter(e.target.value as 'all' | UsageState)}>
              <option value="all">كل الاستخدامات</option>
              <option value="active_now">شغالة الآن</option>
              <option value="active_today">شغلت اليوم</option>
              <option value="active_recently">نشطة مؤخرًا</option>
              <option value="inactive">خاملة</option>
            </select>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={attentionOnly} onChange={(e) => setAttentionOnly(e.target.checked)} />
            اعرض فقط ما يحتاج تدخلي الآن
          </label>
          <div className="mt-3 text-sm text-slate-500">النتائج: {filteredCafes.length}</div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">يحتاج تدخلك الآن</h2>
          <div className="mt-4 space-y-3">
            {attentionQueue.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">لا توجد تنبيهات حرجة الآن.</div>
            ) : attentionQueue.map((cafe) => (
              <button key={cafe.id} onClick={() => onSelectCafe(cafe.id)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-right">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-900">{cafe.display_name}</div>
                    <div className="mt-1 text-xs text-slate-500">{cafe.slug}</div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <span className={`rounded-full border px-2 py-1 ${badgeClassForPayment(cafe.payment_state)}`}>{paymentLabel(cafe.payment_state)}</span>
                    <span className={`rounded-full border px-2 py-1 ${badgeClassForUsage(cafe.usage_state)}`}>{usageLabel(cafe.usage_state)}</span>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-600">
                  {cafe.attention_reasons.map((reason) => (<span key={reason} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">{attentionReasonLabel(reason)}</span>))}
                </div>
                <div className="mt-2 text-xs text-slate-500">آخر نشاط: {formatDateTime(cafe.last_activity_at)}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">محفظة القهاوي</h2>
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {filteredCafes.map((cafe) => (
            <button
              key={cafe.id}
              onClick={() => onSelectCafe(cafe.id)}
              className={`rounded-3xl border p-4 text-right transition ${selectedCafeId === cafe.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-900 hover:border-slate-300'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-bold">{cafe.display_name}</div>
                  <div className="mt-1 text-xs opacity-80">{cafe.slug}</div>
                </div>
                <div className="flex flex-wrap justify-end gap-2 text-[11px]">
                  <span className={`rounded-full border px-2 py-1 ${cafe.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>{cafe.is_active ? 'مفعلة' : 'معطلة'}</span>
                  <span className={`rounded-full border px-2 py-1 ${badgeClassForPayment(cafe.payment_state)}`}>{paymentLabel(cafe.payment_state)}</span>
                  <span className={`rounded-full border px-2 py-1 ${badgeClassForUsage(cafe.usage_state)}`}>{usageLabel(cafe.usage_state)}</span>
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-3"><div className="text-[11px] opacity-70">مبيعات اليوم</div><div className="mt-1 font-semibold">{formatMoney(cafe.net_sales_today)} ج</div></div>
                <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-3"><div className="text-[11px] opacity-70">جلسات اليوم</div><div className="mt-1 font-semibold">{cafe.sessions_today}</div></div>
                <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-3"><div className="text-[11px] opacity-70">مسلّم اليوم</div><div className="mt-1 font-semibold">{cafe.served_qty_today}</div></div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-4 text-sm">
                <div>آخر نشاط: <span className="font-medium">{formatDateTime(cafe.last_activity_at)}</span></div>
                <div>نشاط 7 أيام: <span className="font-medium">{cafe.usage_days_7}</span></div>
                <div>شكاوى مفتوحة: <span className="font-medium">{cafe.open_complaints_count}</span></div>
                <div>آجل قائم: <span className="font-medium">{formatMoney(cafe.deferred_outstanding)} ج</span></div>
              </div>
              {cafe.attention_reasons.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                  {cafe.attention_reasons.map((reason) => (
                    <span key={reason} className={`rounded-full border px-2 py-1 ${selectedCafeId === cafe.id ? 'border-white/30 bg-white/10 text-white' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>{attentionReasonLabel(reason)}</span>
                  ))}
                </div>
              ) : null}
            </button>
          ))}
          {filteredCafes.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">لا توجد قهاوي مطابقة لهذه الفلاتر.</div> : null}
        </div>
      </div>
    </section>
  );
}
