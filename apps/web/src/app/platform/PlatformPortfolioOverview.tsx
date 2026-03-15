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
}: {
  selectedCafeId: string;
  onSelectCafe: (id: string) => void;
  refreshRevision: number;
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

  return (
    <section className="space-y-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">النظرة العامة</h2>
          <p className="mt-1 text-sm text-slate-500">
            ملخص إداري يحافظ على الخصوصية: حالة الاشتراكات، نشاط القهاوي، وآخر استخدام فقط.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          قاعدة البيانات: <strong>{data?.database_usage.database_name ?? '—'}</strong>
          <div className="mt-1 text-xs text-slate-500">آخر تحديث: {formatDateTime(data?.generated_at)}</div>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm text-slate-500">المقاهي</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{data?.summary.cafes_total ?? 0}</div>
          <div className="mt-1 text-xs text-slate-500">المفعلة: {data?.summary.cafes_active ?? 0}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm text-slate-500">الاشتراكات</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{data?.summary.paid_current ?? 0}</div>
          <div className="mt-1 text-xs text-slate-500">مدفوع • متأخر {data?.summary.overdue ?? 0} • معلق {data?.summary.suspended ?? 0}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm text-slate-500">النشاط</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{data?.summary.active_now ?? 0}</div>
          <div className="mt-1 text-xs text-slate-500">وردية مفتوحة الآن • نشاط اليوم {data?.summary.active_today ?? 0}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm text-slate-500">استخدام قاعدة البيانات</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{data?.database_usage.used_pretty ?? '—'}</div>
          <div className="mt-1 text-xs text-slate-500">
            {data?.database_usage.capacity_pretty
              ? `من ${data.database_usage.capacity_pretty} • ${data.database_usage.usage_percent ?? 0}%`
              : 'لا يوجد حد سعة مضبوط'}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <section className="rounded-3xl border border-slate-200 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">القهاوي</h3>
              <p className="text-xs text-slate-500">آخر نشاط، حالة الاشتراك، وهل توجد وردية مفتوحة.</p>
            </div>
            <div className="text-xs text-slate-500">التي تحتاج متابعة: {data?.summary.needs_attention ?? 0}</div>
          </div>
          <div className="space-y-3">
            {data?.cafes.map((cafe) => {
              const isSelected = selectedCafe?.id === cafe.id;
              return (
                <button
                  key={cafe.id}
                  type="button"
                  onClick={() => onSelectCafe(cafe.id)}
                  className={`w-full rounded-2xl border p-4 text-right transition ${
                    isSelected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-900'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold">{cafe.display_name}</div>
                      <div className="mt-1 text-xs opacity-80">{cafe.slug}</div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                      <span className={`rounded-full border px-2 py-1 ${badgeClassForPayment(cafe.payment_state)}`}>{paymentLabel(cafe.payment_state)}</span>
                      <span className={`rounded-full border px-2 py-1 ${badgeClassForUsage(cafe.usage_state)}`}>{usageLabel(cafe.usage_state)}</span>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs opacity-90 md:grid-cols-3">
                    <div>آخر نشاط: {formatDateTime(cafe.last_activity_at)}</div>
                    <div>الملاك النشطون: {cafe.active_owner_count}/{cafe.owner_count}</div>
                    <div>{cafe.has_open_shift ? `وردية مفتوحة من ${formatDateTime(cafe.open_shift_started_at)}` : 'لا توجد وردية مفتوحة'}</div>
                  </div>
                  {cafe.current_subscription ? (
                    <div className="mt-2 text-xs opacity-90">
                      ينتهي الاشتراك: {formatDateTime(cafe.current_subscription.ends_at)} • {countdownLabel(cafe.current_subscription.countdown_seconds)}
                    </div>
                  ) : (
                    <div className="mt-2 text-xs opacity-90">لا يوجد اشتراك حالي.</div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {cafe.attention_reasons.length ? cafe.attention_reasons.map((reason) => (
                      <span key={reason} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
                        {reasonLabel(reason)}
                      </span>
                    )) : <span className="text-xs opacity-80">لا توجد ملاحظات حرجة.</span>}
                  </div>
                </button>
              );
            })}
            {!loading && !data?.cafes.length ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">لا توجد قهاوي لعرضها.</div>
            ) : null}
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-3xl border border-slate-200 p-4">
            <h3 className="text-base font-bold text-slate-900">طابور المتابعة</h3>
            <div className="mt-3 space-y-3">
              {data?.attention_queue.length ? data.attention_queue.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  <div className="font-semibold text-slate-900">{item.display_name}</div>
                  <div className="mt-1 text-xs text-slate-500">{item.slug} • آخر نشاط {formatDateTime(item.last_activity_at)}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.attention_reasons.map((reason) => (
                      <span key={reason} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
                        {reasonLabel(reason)}
                      </span>
                    ))}
                  </div>
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">لا توجد عناصر تحتاج متابعة الآن.</div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 p-4">
            <h3 className="text-base font-bold text-slate-900">القهوة المختارة</h3>
            {selectedCafe ? (
              <div className="mt-3 space-y-3 text-sm text-slate-700">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="font-semibold text-slate-900">{selectedCafe.display_name}</div>
                  <div className="mt-1 text-xs text-slate-500">{selectedCafe.slug}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div>الحالة: <strong>{selectedCafe.is_active ? 'مفعلة' : 'معطلة'}</strong></div>
                  <div className="mt-1">آخر نشاط: <strong>{formatDateTime(selectedCafe.last_activity_at)}</strong></div>
                  <div className="mt-1">وردية الآن: <strong>{selectedCafe.has_open_shift ? 'نعم' : 'لا'}</strong></div>
                </div>
              </div>
            ) : (
              <div className="mt-3 rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">اختر قهوة من القائمة لعرض ملخصها هنا.</div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
