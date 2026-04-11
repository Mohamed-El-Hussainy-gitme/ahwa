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
  operational_last_activity_at: string | null;
  last_online_at: string | null;
  last_app_opened_at: string | null;
  online_users_count: number;
  visible_runtime_count: number;
  open_sessions_count: number;
  active_staff_count: number;
  last_open_order_at: string | null;
  last_open_order_id: string | null;
  last_open_order_session_id: string | null;
  last_open_order_session_label: string | null;
  last_open_order_status: string | null;
  last_open_order_items_count: number;
  has_open_shift: boolean;
  open_shift_business_date: string | null;
  open_shift_started_at: string | null;
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
  open_shifts_now: number;
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
    (typeof value.operational_last_activity_at === 'string' || value.operational_last_activity_at === null) &&
    (typeof value.last_online_at === 'string' || value.last_online_at === null) &&
    (typeof value.last_app_opened_at === 'string' || value.last_app_opened_at === null) &&
    typeof value.online_users_count === 'number' &&
    typeof value.visible_runtime_count === 'number' &&
    typeof value.open_sessions_count === 'number' &&
    typeof value.active_staff_count === 'number' &&
    (typeof value.last_open_order_at === 'string' || value.last_open_order_at === null) &&
    (typeof value.last_open_order_id === 'string' || value.last_open_order_id === null) &&
    (typeof value.last_open_order_session_id === 'string' || value.last_open_order_session_id === null) &&
    (typeof value.last_open_order_session_label === 'string' || value.last_open_order_session_label === null) &&
    (typeof value.last_open_order_status === 'string' || value.last_open_order_status === null) &&
    typeof value.last_open_order_items_count === 'number' &&
    typeof value.has_open_shift === 'boolean' &&
    (typeof value.open_shift_business_date === 'string' || value.open_shift_business_date === null) &&
    (typeof value.open_shift_started_at === 'string' || value.open_shift_started_at === null) &&
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
    typeof value.open_shifts_now === 'number'
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

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function countdownLabel(totalSeconds: number) {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600);
  if (days > 0) return `${days} يوم و ${hours} ساعة`;
  const minutes = Math.floor((safe % 3600) / 60);
  return `${hours} ساعة و ${minutes} دقيقة`;
}

function badgeClassForPayment(state: PaymentState) {
  switch (state) {
    case 'paid_current':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'overdue':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'suspended':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700';
  }
}

function badgeClassForUsage(state: UsageState) {
  switch (state) {
    case 'active_now':
      return 'border-sky-200 bg-sky-50 text-sky-700';
    case 'active_today':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'active_recently':
      return 'border-violet-200 bg-violet-50 text-violet-700';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700';
  }
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
      return 'وردية مفتوحة منذ مدة طويلة';
    case 'paid_but_inactive':
      return 'اشتراك مدفوع لكن النشاط متوقف';
    default:
      return reason;
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

function latestPresenceAt(cafe: Pick<PortfolioCafeRow, 'last_online_at' | 'last_app_opened_at' | 'last_activity_at'>) {
  return cafe.last_online_at ?? cafe.last_app_opened_at ?? cafe.last_activity_at;
}

function operationalActivityAt(cafe: Pick<PortfolioCafeRow, 'operational_last_activity_at' | 'last_activity_at'>) {
  return cafe.operational_last_activity_at ?? cafe.last_activity_at;
}

function presenceLabel(cafe: Pick<PortfolioCafeRow, 'online_users_count' | 'visible_runtime_count'>) {
  return cafe.online_users_count > 0 ? 'أونلاين الآن' : cafe.visible_runtime_count > 0 ? 'مرئي بدون heartbeat' : 'غير متصل';
}

function presenceBadgeClass(cafe: Pick<PortfolioCafeRow, 'online_users_count' | 'visible_runtime_count'>) {
  return cafe.online_users_count > 0
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : cafe.visible_runtime_count > 0
      ? 'border-sky-200 bg-sky-50 text-sky-700'
      : 'border-slate-200 bg-slate-50 text-slate-700';
}

function describeLastOpenOrder(cafe: Pick<PortfolioCafeRow, 'last_open_order_id' | 'last_open_order_at' | 'last_open_order_session_label' | 'last_open_order_status' | 'last_open_order_items_count'>) {
  if (!cafe.last_open_order_id) return 'لا يوجد طلب فعلي من جلسة مفتوحة الآن';
  const sessionLabel = cafe.last_open_order_session_label ? ` • ${cafe.last_open_order_session_label}` : '';
  const status = cafe.last_open_order_status ? ` • ${cafe.last_open_order_status}` : '';
  return `${formatDateTime(cafe.last_open_order_at)} • ${cafe.last_open_order_items_count} صنف${sessionLabel}${status}`;
}


export default function PlatformPortfolioOverview({
  selectedCafeId,
  onSelectCafe,
  refreshRevision,
  supportNewCount = 0,
  onRefreshRequested,
}: {
  selectedCafeId: string;
  onSelectCafe: (id: string) => void;
  refreshRevision: number;
  supportNewCount?: number;
  onRefreshRequested?: () => void;
}) {
  const [data, setData] = useState<PlatformOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/platform/overview', { cache: 'no-store' });
      const json: unknown = await res.json().catch(() => ({}));

      if (!res.ok || !isPlatformApiOk(json)) {
        throw new Error(extractPlatformApiErrorMessage(json, 'LOAD_PLATFORM_OVERVIEW_FAILED'));
      }

      setData(isOverviewResponse(json) ? json.data : null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'LOAD_PLATFORM_OVERVIEW_FAILED');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshRevision]);

  const selectedCafe = useMemo(() => {
    if (!data) return null;
    return (
      data.cafes.find((item) => item.id === selectedCafeId) ??
      data.cafes.find((item) => item.id === data.attention_queue[0]?.id) ??
      data.cafes[0] ??
      null
    );
  }, [data, selectedCafeId]);

  const expiringSoon = useMemo(
    () =>
      (data?.cafes ?? [])
        .filter(
          (item) =>
            item.current_subscription &&
            item.current_subscription.countdown_seconds <= 86400 * 7 &&
            item.current_subscription.effective_status !== 'expired',
        )
        .slice(0, 6),
    [data],
  );

  const usagePercent = typeof data?.database_usage.usage_percent === 'number'
    ? Math.max(0, Math.min(100, data.database_usage.usage_percent))
    : 0;

  const cafesOnlineNowCount = useMemo(
    () => (data?.cafes ?? []).filter((cafe) => cafe.online_users_count > 0).length,
    [data],
  );
  const onlineUsersTotal = useMemo(
    () => (data?.cafes ?? []).reduce((sum, cafe) => sum + cafe.online_users_count, 0),
    [data],
  );
  const visibleRuntimeTotal = useMemo(
    () => (data?.cafes ?? []).reduce((sum, cafe) => sum + cafe.visible_runtime_count, 0),
    [data],
  );

  return (
    <div className="space-y-6">
      <section className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-indigo-600">النظرة العامة</div>
          <h1 className="text-2xl font-bold text-slate-900">لوحة تشغيل المنصة</h1>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">القهاوي النشطة</div>
            <div className="mt-2 text-3xl font-bold text-slate-900">{data?.summary.cafes_active ?? 0}</div>
            <div className="mt-2 text-xs text-slate-500">من أصل {data?.summary.cafes_total ?? 0} قهوة مسجلة</div>
          </div>
          <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <div className="text-sm text-emerald-800">قهاوي أونلاين الآن</div>
            <div className="mt-2 text-3xl font-bold text-emerald-900">{cafesOnlineNowCount}</div>
            <div className="mt-2 text-xs text-emerald-700">Presence حي من التطبيق</div>
          </div>
          <div className="rounded-[24px] border border-sky-200 bg-sky-50 p-5 shadow-sm">
            <div className="text-sm text-sky-800">مستخدمون أونلاين</div>
            <div className="mt-2 text-3xl font-bold text-sky-900">{onlineUsersTotal}</div>
            <div className="mt-2 text-xs text-sky-700">شاشات مرئية الآن: {visibleRuntimeTotal}</div>
          </div>
          <div className="rounded-[24px] border border-rose-200 bg-rose-50 p-5 shadow-sm">
            <div className="text-sm text-rose-800">اشتراكات متعثرة</div>
            <div className="mt-2 text-3xl font-bold text-rose-900">{(data?.summary.overdue ?? 0) + (data?.summary.suspended ?? 0)}</div>
            <div className="mt-2 text-xs text-rose-700">معلق: {data?.summary.suspended ?? 0} • متأخر: {data?.summary.overdue ?? 0}</div>
          </div>
        </div>

        <aside className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-indigo-600">صحة المنصة</div>
              <h2 className="mt-1 text-lg font-bold text-slate-900">قاعدة التشغيل الحالية</h2>
            </div>
            <button
              type="button"
              onClick={() => {
                void load();
                onRefreshRequested?.();
              }}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
            >
              تحديث
            </button>
          </div>
          <div className="mt-5 rounded-[20px] border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-slate-700">قاعدة البيانات</span>
              <span className="font-semibold text-slate-900">{data?.database_usage.database_name ?? '—'}</span>
            </div>
            <div className="mt-4 flex items-end justify-between gap-3">
              <div>
                <div className="text-xs text-slate-500">المستخدم حاليًا</div>
                <div className="mt-1 text-2xl font-bold text-slate-900">{data?.database_usage.used_pretty ?? '—'}</div>
              </div>
              <div className="text-left text-xs text-slate-500">
                <div>{data?.database_usage.capacity_pretty ?? 'لا يوجد حد أعلى'}</div>
                <div className="mt-1">آخر تحديث: {formatDateTime(data?.generated_at)}</div>
              </div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${usagePercent}%` }} />
            </div>
            <div className="mt-2 text-xs text-slate-500">نسبة الاستخدام: {typeof data?.database_usage.usage_percent === 'number' ? `${data.database_usage.usage_percent.toFixed(1)}%` : 'غير محسوبة'}</div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[20px] border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">ورديات مفتوحة</div>
              <div className="mt-1 text-xl font-bold text-slate-900">{data?.summary.open_shifts_now ?? 0}</div>
              <div className="mt-1 text-xs text-slate-500">قهاوي تحتاج تدخل: {data?.summary.needs_attention ?? 0}</div>
            </div>
            <div className="rounded-[20px] border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">رسائل دعم جديدة</div>
              <div className="mt-1 text-xl font-bold text-slate-900">{supportNewCount}</div>
              <div className="mt-1 text-xs text-slate-500">نشاط اليوم: {data?.summary.active_today ?? 0}</div>
            </div>
          </div>
        </aside>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_360px]">
        <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-indigo-600">يحتاج تدخل الآن</div>
              <h2 className="mt-1 text-lg font-bold text-slate-900">طابور المتابعة التنفيذي</h2>
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
              {data?.summary.needs_attention ?? 0} عناصر متابعة
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {(data?.attention_queue ?? []).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectCafe(item.id)}
                className="flex w-full flex-col gap-3 px-5 py-4 text-right transition hover:bg-slate-50 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-base font-semibold text-slate-900">{item.display_name}</div>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badgeClassForPayment(item.payment_state)}`}>
                      {paymentLabel(item.payment_state)}
                    </span>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badgeClassForUsage(item.usage_state)}`}>
                      {usageLabel(item.usage_state)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{item.slug} • آخر حركة متابعة: {formatDateTime(item.last_activity_at)}</div>
                </div>
                <div className="flex flex-1 flex-wrap gap-2 lg:justify-end">
                  {item.attention_reasons.map((reason) => (
                    <span key={reason} className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                      {reasonLabel(reason)}
                    </span>
                  ))}
                </div>
              </button>
            ))}
            {data && data.attention_queue.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">لا توجد عناصر تحتاج متابعة الآن.</div>
            ) : null}
            {!data && loading ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">جارٍ تحميل الطابور...</div>
            ) : null}
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-indigo-600">القهوة المحددة</div>
                <h3 className="mt-1 text-lg font-bold text-slate-900">ملخص سريع</h3>
              </div>
              {selectedCafe ? (
                <button
                  type="button"
                  onClick={() => onSelectCafe(selectedCafe.id)}
                  className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700"
                >
                  فتح السجل
                </button>
              ) : null}
            </div>
            {selectedCafe ? (
              <div className="mt-4 space-y-4 text-sm text-slate-700">
                <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                  <div className="font-semibold text-slate-900">{selectedCafe.display_name}</div>
                  <div className="mt-1 text-xs text-slate-500">{selectedCafe.slug}</div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[20px] border border-slate-200 bg-white p-4">
                    <div className="text-xs text-slate-500">الحضور الآن</div>
                    <div className="mt-1 font-semibold text-slate-900">{presenceLabel(selectedCafe)}</div>
                    <div className="mt-1 text-xs text-slate-500">{selectedCafe.online_users_count} مستخدم • {selectedCafe.visible_runtime_count} شاشة</div>
                  </div>
                  <div className="rounded-[20px] border border-slate-200 bg-white p-4">
                    <div className="text-xs text-slate-500">آخر ظهور</div>
                    <div className="mt-1 font-semibold text-slate-900">{formatDateTime(latestPresenceAt(selectedCafe))}</div>
                  </div>
                  <div className="rounded-[20px] border border-slate-200 bg-white p-4">
                    <div className="text-xs text-slate-500">آخر فتح تطبيق</div>
                    <div className="mt-1 font-semibold text-slate-900">{formatDateTime(selectedCafe.last_app_opened_at)}</div>
                  </div>
                  <div className="rounded-[20px] border border-slate-200 bg-white p-4">
                    <div className="text-xs text-slate-500">آخر نشاط تشغيلي</div>
                    <div className="mt-1 font-semibold text-slate-900">{formatDateTime(operationalActivityAt(selectedCafe))}</div>
                  </div>
                  <div className="rounded-[20px] border border-slate-200 bg-white p-4">
                    <div className="text-xs text-slate-500">الجلسات المفتوحة</div>
                    <div className="mt-1 font-semibold text-slate-900">{selectedCafe.open_sessions_count} جلسة • {selectedCafe.active_staff_count} مستخدم</div>
                  </div>
                  <div className="rounded-[20px] border border-slate-200 bg-white p-4 sm:col-span-2">
                    <div className="text-xs text-slate-500">آخر طلب فعلي</div>
                    <div className="mt-1 font-semibold text-slate-900">{selectedCafe.last_open_order_id ?? '—'}</div>
                    <div className="mt-1 text-xs text-slate-500">{describeLastOpenOrder(selectedCafe)}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${presenceBadgeClass(selectedCafe)}`}>
                    {presenceLabel(selectedCafe)}
                  </span>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClassForPayment(selectedCafe.payment_state)}`}>
                    {paymentLabel(selectedCafe.payment_state)}
                  </span>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClassForUsage(selectedCafe.usage_state)}`}>
                    {usageLabel(selectedCafe.usage_state)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-[20px] border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                اختر قهوة من الطابور أو السجل لعرض ملخصها هنا.
              </div>
            )}
          </section>

          <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-indigo-600">استحقاقات قريبة</div>
            <h3 className="mt-1 text-lg font-bold text-slate-900">خلال 7 أيام</h3>
            <div className="mt-4 space-y-3">
              {expiringSoon.map((cafe) => (
                <button
                  key={cafe.id}
                  type="button"
                  onClick={() => onSelectCafe(cafe.id)}
                  className="w-full rounded-[20px] border border-slate-200 bg-slate-50 p-4 text-right transition hover:border-slate-300 hover:bg-white"
                >
                  <div className="font-semibold text-slate-900">{cafe.display_name}</div>
                  <div className="mt-1 text-xs text-slate-500">{cafe.slug}</div>
                  <div className="mt-2 text-sm text-slate-700">حتى {formatDateTime(cafe.current_subscription?.ends_at)}</div>
                  <div className="mt-1 text-xs text-slate-500">{countdownLabel(cafe.current_subscription?.countdown_seconds ?? 0)}</div>
                </button>
              ))}
              {expiringSoon.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                  لا توجد استحقاقات قريبة خلال 7 أيام.
                </div>
              ) : null}
            </div>
          </section>
        </aside>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-indigo-600">سجل مختصر</div>
            <h2 className="mt-1 text-lg font-bold text-slate-900">آخر النشاط على المحفظة</h2>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
            نشاط اليوم: {data?.summary.active_today ?? 0}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-right text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-3">القهوة</th>
                <th className="px-4 py-3">الاشتراك</th>
                <th className="px-4 py-3">التشغيل</th>
                <th className="px-4 py-3">الواقع الحي</th>
              </tr>
            </thead>
            <tbody>
              {(data?.cafes ?? []).slice(0, 12).map((cafe) => (
                <tr key={cafe.id} className={selectedCafe?.id === cafe.id ? 'border-t border-slate-100 bg-indigo-50/50' : 'border-t border-slate-100 bg-white'}>
                  <td className="px-4 py-4">
                    <button type="button" onClick={() => onSelectCafe(cafe.id)} className="text-right">
                      <div className="font-semibold text-slate-900">{cafe.display_name}</div>
                      <div className="mt-1 text-xs text-slate-500">{cafe.slug}</div>
                    </button>
                  </td>
                  <td className="px-4 py-4">
                    <div className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClassForPayment(cafe.payment_state)}`}>
                      {paymentLabel(cafe.payment_state)}
                    </div>
                    {cafe.current_subscription ? <div className="mt-2 text-xs text-slate-500">{countdownLabel(cafe.current_subscription.countdown_seconds)}</div> : null}
                  </td>
                  <td className="px-4 py-4">
                    <div className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClassForUsage(cafe.usage_state)}`}>
                      {usageLabel(cafe.usage_state)}
                    </div>
                    <div className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${presenceBadgeClass(cafe)}`}>
                      {presenceLabel(cafe)}
                    </div>
                    <div className="mt-2 text-xs text-slate-500">{cafe.has_open_shift ? 'وردية مفتوحة الآن' : 'بدون وردية مفتوحة'}</div>
                  </td>
                  <td className="px-4 py-4 text-slate-700">
                    <div className="space-y-1 text-xs">
                      <div><span className="text-slate-500">آخر ظهور:</span> {formatDateTime(latestPresenceAt(cafe))}</div>
                      <div><span className="text-slate-500">فتح التطبيق:</span> {formatDateTime(cafe.last_app_opened_at)}</div>
                      <div><span className="text-slate-500">نشاط تشغيلي:</span> {formatDateTime(operationalActivityAt(cafe))}</div>
                      <div><span className="text-slate-500">آخر طلب:</span> {cafe.last_open_order_id ?? '—'}</div>
                      <div><span className="text-slate-500">التفصيل:</span> {describeLastOpenOrder(cafe)}</div>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && !data?.cafes.length ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-500">لا توجد قهاوي لعرضها.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
