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


export default function PlatformPortfolioOverview({
  selectedCafeId,
  onSelectCafe,
  refreshRevision,
  supportNewCount = 0,
}: {
  selectedCafeId: string;
  onSelectCafe: (id: string) => void;
  refreshRevision: number;
  supportNewCount?: number;
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

  const selectedCafe = useMemo(
    () => data?.cafes.find((item) => item.id === selectedCafeId) ?? null,
    [data, selectedCafeId],
  );

  const expiringSoon = useMemo(
    () => (data?.cafes ?? [])
      .filter((item) => item.current_subscription && item.current_subscription.countdown_seconds <= 86400 * 7 && item.current_subscription.effective_status !== 'expired')
      .slice(0, 6),
    [data],
  );

  return (
    <section className="space-y-6 rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="text-sm font-semibold text-indigo-600">Overview</div>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">النظرة العامة</h2>
          <p className="mt-2 text-sm text-slate-500">ملخص سريع يركز على القرار الإداري: من يحتاج متابعة، من يقترب اشتراكه، وما حجم النشاط الحالي دون كشف بيانات التشغيل الحساسة.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700">تحديث النظرة العامة</button>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            قاعدة البيانات: <strong>{data?.database_usage.database_name ?? '—'}</strong>
            <div className="mt-1 text-xs text-slate-500">آخر تحديث: {formatDateTime(data?.generated_at)}</div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm text-slate-500">إجمالي القهاوي</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{data?.summary.cafes_total ?? 0}</div>
          <div className="mt-2 text-xs text-slate-500">المفعلة: {data?.summary.cafes_active ?? 0}</div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm text-slate-500">النشط الآن</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{data?.summary.active_now ?? 0}</div>
          <div className="mt-2 text-xs text-slate-500">ورديات مفتوحة: {data?.summary.open_shifts_now ?? 0}</div>
        </div>
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-sm text-amber-700">منتهي / متأخر</div>
          <div className="mt-2 text-3xl font-bold text-amber-900">{(data?.summary.overdue ?? 0) + (data?.summary.suspended ?? 0)}</div>
          <div className="mt-2 text-xs text-amber-700">معلق: {data?.summary.suspended ?? 0} • متأخر: {data?.summary.overdue ?? 0}</div>
        </div>
        <div className="rounded-3xl border border-sky-200 bg-sky-50 p-4">
          <div className="text-sm text-sky-700">رسائل الدعم الجديدة</div>
          <div className="mt-2 text-3xl font-bold text-sky-900">{supportNewCount}</div>
          <div className="mt-2 text-xs text-sky-700">طلبات تحتاج فتحًا سريعًا</div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm text-slate-500">استخدام قاعدة البيانات</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{data?.database_usage.used_pretty ?? '—'}</div>
          <div className="mt-2 text-xs text-slate-500">{data?.database_usage.capacity_pretty ? `من ${data.database_usage.capacity_pretty} • ${data.database_usage.usage_percent ?? 0}%` : 'لا يوجد حد سعة مضبوط'}</div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_400px]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-slate-200 p-4">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">طابور المتابعة</h3>
                <p className="mt-1 text-sm text-slate-500">الحالات التي تستحق قرارًا أو تواصلاً سريعًا.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">إجمالي ما يحتاج متابعة: {data?.summary.needs_attention ?? 0}</div>
            </div>
            <div className="overflow-x-auto rounded-3xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-3 text-right font-medium">القهوة</th>
                    <th className="px-3 py-3 text-right font-medium">الحالة</th>
                    <th className="px-3 py-3 text-right font-medium">آخر نشاط</th>
                    <th className="px-3 py-3 text-right font-medium">أسباب المتابعة</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.attention_queue ?? []).map((item) => (
                    <tr key={item.id} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-4">
                        <button type="button" onClick={() => onSelectCafe(item.id)} className="text-right">
                          <div className="font-semibold text-slate-900">{item.display_name}</div>
                          <div className="mt-1 text-xs text-slate-500">{item.slug}</div>
                        </button>
                      </td>
                      <td className="px-3 py-4">
                        <div className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${badgeClassForPayment(item.payment_state)}`}>{paymentLabel(item.payment_state)}</div>
                        <div className={`mt-2 inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${badgeClassForUsage(item.usage_state)}`}>{usageLabel(item.usage_state)}</div>
                      </td>
                      <td className="px-3 py-4 text-slate-700">{formatDateTime(item.last_activity_at)}</td>
                      <td className="px-3 py-4">
                        <div className="flex flex-wrap gap-2">
                          {item.attention_reasons.map((reason) => (
                            <span key={reason} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">{reasonLabel(reason)}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {data && data.attention_queue.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-10 text-center text-slate-500">لا توجد عناصر تحتاج متابعة الآن.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 p-4">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">آخر النشاط</h3>
                <p className="mt-1 text-sm text-slate-500">جدول مختصر للوصول السريع إلى القهوة المناسبة.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">نشاط اليوم: {data?.summary.active_today ?? 0}</div>
            </div>
            <div className="overflow-x-auto rounded-3xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-3 text-right font-medium">القهوة</th>
                    <th className="px-3 py-3 text-right font-medium">الاشتراك</th>
                    <th className="px-3 py-3 text-right font-medium">النشاط</th>
                    <th className="px-3 py-3 text-right font-medium">آخر حركة</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.cafes ?? []).slice(0, 12).map((cafe) => (
                    <tr key={cafe.id} className={`border-t border-slate-100 align-top ${selectedCafe?.id === cafe.id ? 'bg-indigo-50/50' : 'bg-white'}`}>
                      <td className="px-3 py-4">
                        <button type="button" onClick={() => onSelectCafe(cafe.id)} className="text-right">
                          <div className="font-semibold text-slate-900">{cafe.display_name}</div>
                          <div className="mt-1 text-xs text-slate-500">{cafe.slug}</div>
                        </button>
                      </td>
                      <td className="px-3 py-4">
                        <div className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${badgeClassForPayment(cafe.payment_state)}`}>{paymentLabel(cafe.payment_state)}</div>
                        {cafe.current_subscription ? <div className="mt-2 text-xs text-slate-500">{countdownLabel(cafe.current_subscription.countdown_seconds)}</div> : null}
                      </td>
                      <td className="px-3 py-4">
                        <div className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${badgeClassForUsage(cafe.usage_state)}`}>{usageLabel(cafe.usage_state)}</div>
                        <div className="mt-2 text-xs text-slate-500">{cafe.has_open_shift ? 'وردية مفتوحة الآن' : 'بدون وردية مفتوحة'}</div>
                      </td>
                      <td className="px-3 py-4 text-slate-700">{formatDateTime(cafe.last_activity_at)}</td>
                    </tr>
                  ))}
                  {!loading && !data?.cafes.length ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-10 text-center text-slate-500">لا توجد قهاوي لعرضها.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <section className="space-y-6">
          <div className="rounded-3xl border border-slate-200 p-4">
            <h3 className="text-lg font-bold text-slate-900">القهوة المختارة</h3>
            {selectedCafe ? (
              <div className="mt-4 space-y-3 text-sm text-slate-700">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="font-semibold text-slate-900">{selectedCafe.display_name}</div>
                  <div className="mt-1 text-xs text-slate-500">{selectedCafe.slug}</div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-xs text-slate-500">الحالة</div>
                    <div className="mt-1 font-semibold text-slate-900">{selectedCafe.is_active ? 'مفعلة' : 'معطلة'}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-xs text-slate-500">آخر نشاط</div>
                    <div className="mt-1 font-semibold text-slate-900">{formatDateTime(selectedCafe.last_activity_at)}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-xs text-slate-500">الملاك النشطون</div>
                    <div className="mt-1 font-semibold text-slate-900">{selectedCafe.active_owner_count}/{selectedCafe.owner_count}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-xs text-slate-500">الوردية الحالية</div>
                    <div className="mt-1 font-semibold text-slate-900">{selectedCafe.has_open_shift ? 'مفتوحة الآن' : 'لا توجد'}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">اختر قهوة من الجداول لعرض ملخصها هنا.</div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 p-4">
            <h3 className="text-lg font-bold text-slate-900">قريب الاستحقاق</h3>
            <div className="mt-4 space-y-3">
              {expiringSoon.map((cafe) => (
                <button key={cafe.id} type="button" onClick={() => onSelectCafe(cafe.id)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-right">
                  <div className="font-semibold text-slate-900">{cafe.display_name}</div>
                  <div className="mt-1 text-xs text-slate-500">{cafe.slug}</div>
                  <div className="mt-2 text-sm text-slate-700">حتى {formatDateTime(cafe.current_subscription?.ends_at)}</div>
                  <div className="mt-1 text-xs text-slate-500">{countdownLabel(cafe.current_subscription?.countdown_seconds ?? 0)}</div>
                </button>
              ))}
              {expiringSoon.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">لا توجد استحقاقات قريبة خلال 7 أيام.</div> : null}
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
