'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PlatformAdminSession } from '@/lib/platform-auth/session';
import {
  extractPlatformApiErrorMessage,
  isPlatformApiOk,
} from '@/lib/platform-auth/api';
import PlatformPortfolioOverview from './PlatformPortfolioOverview';

type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'suspended';
type ViewKey = 'overview' | 'cafes' | 'money';

type CafeSubscriptionRow = {
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

type CafeOwnerRow = {
  id: string;
  full_name: string;
  phone: string;
  owner_label: 'owner' | 'partner';
  is_active: boolean;
  created_at: string;
};

type CafeRow = {
  id: string;
  slug: string;
  display_name: string;
  is_active: boolean;
  created_at: string;
  last_activity_at?: string | null;
  owner_count?: number;
  active_owner_count?: number;
  owners?: CafeOwnerRow[];
  current_subscription?: CafeSubscriptionRow | null;
};

type MoneyFollowSummary = {
  subscriptions_total: number;
  paid_entries: number;
  complimentary_entries: number;
  collected_total: number;
  overdue_count: number;
  due_soon_count: number;
  suspended_count: number;
};

type MoneyFollowWatchRow = {
  cafe_id: string;
  slug: string;
  display_name: string;
  is_active: boolean;
  payment_state: 'paid_current' | 'trial_or_free' | 'overdue' | 'suspended';
  effective_status: SubscriptionStatus | null;
  ends_at: string | null;
  countdown_seconds: number | null;
  amount_paid: number | null;
  is_complimentary: boolean | null;
  last_activity_at: string | null;
  has_open_shift: boolean;
  notes: string | null;
};

type MoneyFollowEntryRow = {
  subscription_id: string;
  cafe_id: string;
  slug: string;
  display_name: string;
  starts_at: string;
  ends_at: string;
  status: SubscriptionStatus;
  effective_status: SubscriptionStatus;
  amount_paid: number;
  is_complimentary: boolean;
  notes: string | null;
  created_at: string;
};

type MoneyFollowResponseData = {
  generated_at: string;
  summary: MoneyFollowSummary;
  watchlist: MoneyFollowWatchRow[];
  recent_entries: MoneyFollowEntryRow[];
};

type CafeListResponse = { ok: true; items: CafeRow[] };
type CreateCafeResponse = { ok: true; data?: { cafe_id?: string } };
type MoneyFollowApiResponse = { ok: true; data: MoneyFollowResponseData | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return value === 'trial' || value === 'active' || value === 'expired' || value === 'suspended';
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
    typeof value.amount_paid === 'number' &&
    typeof value.is_complimentary === 'boolean' &&
    (typeof value.notes === 'string' || value.notes === null) &&
    typeof value.created_at === 'string' &&
    (typeof value.last_activity_at === 'undefined' || typeof value.last_activity_at === 'string' || value.last_activity_at === null) &&
    typeof value.updated_at === 'string' &&
    typeof value.countdown_seconds === 'number'
  );
}

function isCafeOwnerRow(value: unknown): value is CafeOwnerRow {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.full_name === 'string' &&
    typeof value.phone === 'string' &&
    (value.owner_label === 'owner' || value.owner_label === 'partner') &&
    typeof value.is_active === 'boolean' &&
    typeof value.created_at === 'string'
  );
}

function isCafeRow(value: unknown): value is CafeRow {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.slug === 'string' &&
    typeof value.display_name === 'string' &&
    typeof value.is_active === 'boolean' &&
    typeof value.created_at === 'string' &&
    (typeof value.last_activity_at === 'undefined' || typeof value.last_activity_at === 'string' || value.last_activity_at === null) &&
    (typeof value.owner_count === 'undefined' || typeof value.owner_count === 'number') &&
    (typeof value.active_owner_count === 'undefined' || typeof value.active_owner_count === 'number') &&
    (typeof value.owners === 'undefined' || (Array.isArray(value.owners) && value.owners.every(isCafeOwnerRow))) &&
    (typeof value.current_subscription === 'undefined' || value.current_subscription === null || isCafeSubscriptionRow(value.current_subscription))
  );
}

function isCafeListResponse(value: unknown): value is CafeListResponse {
  return isRecord(value) && value.ok === true && Array.isArray(value.items) && value.items.every(isCafeRow);
}

function isCreateCafeResponse(value: unknown): value is CreateCafeResponse {
  if (!isRecord(value) || value.ok !== true) return false;
  if (typeof value.data === 'undefined') return true;
  return isRecord(value.data) && (typeof value.data.cafe_id === 'undefined' || typeof value.data.cafe_id === 'string');
}

function isMoneyFollowSummary(value: unknown): value is MoneyFollowSummary {
  return (
    isRecord(value) &&
    typeof value.subscriptions_total === 'number' &&
    typeof value.paid_entries === 'number' &&
    typeof value.complimentary_entries === 'number' &&
    typeof value.collected_total === 'number' &&
    typeof value.overdue_count === 'number' &&
    typeof value.due_soon_count === 'number' &&
    typeof value.suspended_count === 'number'
  );
}

function isMoneyFollowWatchRow(value: unknown): value is MoneyFollowWatchRow {
  return (
    isRecord(value) &&
    typeof value.cafe_id === 'string' &&
    typeof value.slug === 'string' &&
    typeof value.display_name === 'string' &&
    typeof value.is_active === 'boolean' &&
    (value.payment_state === 'paid_current' || value.payment_state === 'trial_or_free' || value.payment_state === 'overdue' || value.payment_state === 'suspended') &&
    (value.effective_status === null || isSubscriptionStatus(value.effective_status)) &&
    (typeof value.ends_at === 'string' || value.ends_at === null) &&
    (typeof value.countdown_seconds === 'number' || value.countdown_seconds === null) &&
    (typeof value.amount_paid === 'number' || value.amount_paid === null) &&
    (typeof value.is_complimentary === 'boolean' || value.is_complimentary === null) &&
    (typeof value.last_activity_at === 'string' || value.last_activity_at === null) &&
    typeof value.has_open_shift === 'boolean' &&
    (typeof value.notes === 'string' || value.notes === null)
  );
}

function isMoneyFollowEntryRow(value: unknown): value is MoneyFollowEntryRow {
  return (
    isRecord(value) &&
    typeof value.subscription_id === 'string' &&
    typeof value.cafe_id === 'string' &&
    typeof value.slug === 'string' &&
    typeof value.display_name === 'string' &&
    typeof value.starts_at === 'string' &&
    typeof value.ends_at === 'string' &&
    isSubscriptionStatus(value.status) &&
    isSubscriptionStatus(value.effective_status) &&
    typeof value.amount_paid === 'number' &&
    typeof value.is_complimentary === 'boolean' &&
    (typeof value.notes === 'string' || value.notes === null) &&
    typeof value.created_at === 'string'
  );
}

function isMoneyFollowResponse(value: unknown): value is MoneyFollowApiResponse {
  return (
    isRecord(value) &&
    value.ok === true &&
    (value.data === null || (
      isRecord(value.data) &&
      typeof value.data.generated_at === 'string' &&
      isMoneyFollowSummary(value.data.summary) &&
      Array.isArray(value.data.watchlist) &&
      value.data.watchlist.every(isMoneyFollowWatchRow) &&
      Array.isArray(value.data.recent_entries) &&
      value.data.recent_entries.every(isMoneyFollowEntryRow)
    ))
  );
}

function createPlatformError(payload: unknown, fallback: string) {
  return new Error(extractPlatformApiErrorMessage(payload, fallback));
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

function amountLabel(value: number | null | undefined) {
  const safe = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('ar-EG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromDateInputValue(value: string) {
  return new Date(`${value}T00:00:00`).toISOString();
}

function countdownLabel(totalSeconds: number | null | undefined) {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(Number(totalSeconds))) : 0;
  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600);
  if (days > 0) return `${days} يوم و ${hours} ساعة`;
  const minutes = Math.floor((safe % 3600) / 60);
  return `${hours} ساعة و ${minutes} دقيقة`;
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

function cafeStatusBadgeClass(active: boolean) {
  return active
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-rose-200 bg-rose-50 text-rose-700';
}

function paymentStateText(subscription: CafeSubscriptionRow | null | undefined) {
  if (!subscription) return 'بدون اشتراك';
  if (subscription.effective_status === 'suspended') return 'معلق';
  if (subscription.effective_status === 'expired') return 'منتهي';
  if (subscription.effective_status === 'trial') return subscription.is_complimentary ? 'مجاني / تجريبي' : 'تجريبي';
  return subscription.is_complimentary ? 'مجاني' : 'مدفوع';
}

function ownerLabelText(label: 'owner' | 'partner') {
  return label === 'owner' ? 'مالك' : 'شريك';
}

function applyPreset(days: number, complimentary: boolean, status: SubscriptionStatus) {
  const start = new Date();
  const end = new Date(start.getTime() + 1000 * 60 * 60 * 24 * days);
  return {
    startsAt: toDateInputValue(start),
    endsAt: toDateInputValue(end),
    graceDays: '0',
    status,
    amountPaid: complimentary ? '0' : '',
    isComplimentary: complimentary,
  };
}

function MoneyFollowSection({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<MoneyFollowResponseData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/platform/money-follow', { cache: 'no-store' });
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok || !isPlatformApiOk(json)) throw createPlatformError(json, 'LOAD_MONEY_FOLLOW_FAILED');
      setData(isMoneyFollowResponse(json) ? json.data : null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'LOAD_MONEY_FOLLOW_FAILED');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      {!data && loading ? <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500">جارٍ تحميل المتابعة المالية...</div> : null}
      {data ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="إجمالي المقبوض" value={`${amountLabel(data.summary.collected_total)} ج.م`} helper="سجل الاشتراكات المدفوعة فقط" />
            <MetricCard title="المنتهي أو المتأخر" value={String(data.summary.overdue_count)} helper="قهاوي تحتاج تحصيلًا الآن" tone="warn" />
            <MetricCard title="يقترب موعدها" value={String(data.summary.due_soon_count)} helper="خلال 7 أيام" tone="sky" />
            <MetricCard title="اشتراكات مجانية" value={String(data.summary.complimentary_entries)} helper="تجريبي أو مجاني" />
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">قائمة المتابعة</h2>
                  <p className="mt-1 text-sm text-slate-500">المنتهي، المعلق، أو الذي يقترب موعده.</p>
                </div>
                <button type="button" onClick={() => void load()} className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">تحديث</button>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-right font-medium">القهوة</th>
                      <th className="px-3 py-2 text-right font-medium">الحالة</th>
                      <th className="px-3 py-2 text-right font-medium">الاستحقاق</th>
                      <th className="px-3 py-2 text-right font-medium">القيمة</th>
                      <th className="px-3 py-2 text-right font-medium">آخر نشاط</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.watchlist.map((row) => (
                      <tr key={`${row.cafe_id}:${row.ends_at ?? 'none'}`} className="border-t border-slate-100 align-top">
                        <td className="px-3 py-3">
                          <div className="font-medium text-slate-900">{row.display_name}</div>
                          <div className="text-xs text-slate-500">{row.slug}</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${row.effective_status ? subscriptionBadgeClass(row.effective_status) : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                            {row.effective_status ?? 'بدون اشتراك'}
                          </div>
                          <div className="mt-2 text-xs text-slate-500">{row.has_open_shift ? 'وردية مفتوحة الآن' : 'بدون وردية مفتوحة'}</div>
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          <div>{formatDateTime(row.ends_at)}</div>
                          <div className="mt-1 text-xs text-slate-500">{countdownLabel(row.countdown_seconds)}</div>
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          <div>{row.is_complimentary ? 'مجاني' : `${amountLabel(row.amount_paid)} ج.م`}</div>
                          {row.notes ? <div className="mt-1 text-xs text-slate-500">{row.notes}</div> : null}
                        </td>
                        <td className="px-3 py-3 text-slate-700">{formatDateTime(row.last_activity_at)}</td>
                      </tr>
                    ))}
                    {data.watchlist.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-slate-500">لا توجد عناصر متابعة الآن.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">آخر الاشتراكات المسجلة</h2>
              <div className="mt-4 space-y-3">
                {data.recent_entries.slice(0, 12).map((entry) => (
                  <div key={entry.subscription_id} className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-700">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium text-slate-900">{entry.display_name}</div>
                        <div className="text-xs text-slate-500">{entry.slug}</div>
                      </div>
                      <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${subscriptionBadgeClass(entry.effective_status)}`}>{entry.effective_status}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
                      <span>من {formatDateTime(entry.starts_at)}</span>
                      <span>إلى {formatDateTime(entry.ends_at)}</span>
                    </div>
                    <div className="mt-2 text-sm text-slate-700">{entry.is_complimentary ? 'اشتراك مجاني' : `تم تحصيل ${amountLabel(entry.amount_paid)} ج.م`}</div>
                    {entry.notes ? <div className="mt-2 text-xs text-slate-500">{entry.notes}</div> : null}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function MetricCard({
  title,
  value,
  helper,
  tone = 'default',
}: {
  title: string;
  value: string;
  helper: string;
  tone?: 'default' | 'warn' | 'sky';
}) {
  const toneClass = tone === 'warn'
    ? 'border-amber-200 bg-amber-50'
    : tone === 'sky'
      ? 'border-sky-200 bg-sky-50'
      : 'border-slate-200 bg-white';
  return (
    <div className={`rounded-3xl border p-5 shadow-sm ${toneClass}`}>
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
      <div className="mt-2 text-xs text-slate-500">{helper}</div>
    </div>
  );
}

const views: Array<{ key: ViewKey; label: string }> = [
  { key: 'overview', label: 'النظرة العامة' },
  { key: 'cafes', label: 'القهاوي' },
  { key: 'money', label: 'المتابعة المالية' },
];

export default function PlatformDashboardClient({ session }: { session: PlatformAdminSession }) {
  const router = useRouter();
  const today = useMemo(() => new Date(), []);
  const [view, setView] = useState<ViewKey>('overview');
  const [cafes, setCafes] = useState<CafeRow[]>([]);
  const [selectedCafeId, setSelectedCafeId] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [cafeStatusFilter, setCafeStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'free' | 'expired' | 'none'>('all');
  const [createCafe, setCreateCafe] = useState({
    cafeSlug: '',
    cafeDisplayName: '',
    ownerFullName: '',
    ownerPhone: '',
    ownerPassword: '',
    ...applyPreset(30, true, 'trial'),
    notes: '',
  });

  const loadCafes = useCallback(async (preferredCafeId?: string) => {
    const res = await fetch('/api/platform/cafes/list', { cache: 'no-store' });
    const json: unknown = await res.json().catch(() => ({}));
    if (!res.ok || !isPlatformApiOk(json)) throw createPlatformError(json, 'LOAD_CAFES_FAILED');

    const items = isCafeListResponse(json) ? json.items : [];
    setCafes(items);

    const nextSelected =
      preferredCafeId && items.some((item) => item.id === preferredCafeId)
        ? preferredCafeId
        : selectedCafeId && items.some((item) => item.id === selectedCafeId)
          ? selectedCafeId
          : items[0]?.id ?? '';

    setSelectedCafeId(nextSelected);
    return nextSelected;
  }, [selectedCafeId]);

  useEffect(() => {
    void loadCafes().catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : 'LOAD_CAFES_FAILED');
    });
  }, [loadCafes]);

  const selectedCafe = useMemo(() => cafes.find((item) => item.id === selectedCafeId) ?? null, [cafes, selectedCafeId]);

  const filteredCafes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return cafes.filter((cafe) => {
      if (cafeStatusFilter === 'active' && !cafe.is_active) return false;
      if (cafeStatusFilter === 'inactive' && cafe.is_active) return false;
      const subscription = cafe.current_subscription ?? null;
      if (paymentFilter === 'paid' && (!subscription || subscription.is_complimentary || subscription.effective_status !== 'active')) return false;
      if (paymentFilter === 'free' && (!subscription || !subscription.is_complimentary)) return false;
      if (paymentFilter === 'expired' && (!subscription || subscription.effective_status !== 'expired')) return false;
      if (paymentFilter === 'none' && subscription) return false;
      if (!query) return true;
      return cafe.display_name.toLowerCase().includes(query) || cafe.slug.toLowerCase().includes(query);
    });
  }, [cafes, search, cafeStatusFilter, paymentFilter]);

  const expiringSoon = useMemo(() => cafes
    .filter((cafe) => {
      const subscription = cafe.current_subscription;
      return Boolean(subscription && subscription.effective_status !== 'expired' && subscription.countdown_seconds <= 86400 * 7);
    })
    .sort((a, b) => (a.current_subscription?.countdown_seconds ?? Number.MAX_SAFE_INTEGER) - (b.current_subscription?.countdown_seconds ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 8), [cafes]);

  const expiredCafes = useMemo(() => cafes.filter((cafe) => cafe.current_subscription?.effective_status === 'expired').slice(0, 8), [cafes]);

  async function submitCreateCafe() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/platform/cafes/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cafeSlug: createCafe.cafeSlug,
          cafeDisplayName: createCafe.cafeDisplayName,
          ownerFullName: createCafe.ownerFullName,
          ownerPhone: createCafe.ownerPhone,
          ownerPassword: createCafe.ownerPassword,
          subscriptionStartsAt: fromDateInputValue(createCafe.startsAt),
          subscriptionEndsAt: fromDateInputValue(createCafe.endsAt),
          subscriptionGraceDays: Number(createCafe.graceDays || '0'),
          subscriptionStatus: createCafe.status,
          subscriptionAmountPaid: Number(createCafe.amountPaid || '0'),
          subscriptionIsComplimentary: createCafe.isComplimentary,
          subscriptionNotes: createCafe.notes.trim() || null,
        }),
      });
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok || !isPlatformApiOk(json)) throw createPlatformError(json, 'CREATE_CAFE_FAILED');
      const createdCafeId = isCreateCafeResponse(json) && typeof json.data?.cafe_id === 'string' ? json.data.cafe_id : undefined;
      setCreateCafe({
        cafeSlug: '',
        cafeDisplayName: '',
        ownerFullName: '',
        ownerPhone: '',
        ownerPassword: '',
        ...applyPreset(30, true, 'trial'),
        notes: '',
      });
      await loadCafes(createdCafeId);
      setRefreshKey((value) => value + 1);
      setView('cafes');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'CREATE_CAFE_FAILED');
    } finally {
      setBusy(false);
    }
  }

  async function submitToggleCafe(cafeId: string, isActive: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/platform/cafes/toggle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cafeId, isActive }),
      });
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok || !isPlatformApiOk(json)) throw createPlatformError(json, 'TOGGLE_CAFE_FAILED');
      await loadCafes(cafeId);
      setRefreshKey((value) => value + 1);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'TOGGLE_CAFE_FAILED');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch('/api/platform/auth/logout', { method: 'POST' });
    router.replace('/platform/login');
    router.refresh();
  }

  return (
    <main className="min-h-dvh bg-slate-100 p-6 text-slate-900" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">لوحة السوبر أدمن</h1>
            <p className="mt-1 text-sm text-slate-600">{session.displayName} — {session.email}</p>
            <p className="mt-1 text-xs text-slate-500">سطح تحكم إداري سريع للمقاهي، الاشتراكات، والمتابعة المالية الخاصة بك.</p>
          </div>
          <button onClick={logout} className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium">
            خروج
          </button>
        </div>

        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

        <div className="flex flex-wrap gap-2 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
          {views.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setView(item.key)}
              className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${view === item.key ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-slate-50 text-slate-700'}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {view === 'overview' ? (
          <div className="space-y-6">
            <PlatformPortfolioOverview
              selectedCafeId={selectedCafeId}
              onSelectCafe={setSelectedCafeId}
              refreshRevision={refreshKey}
            />
            <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">تنبيهات الاشتراك القريبة</h2>
                    <p className="mt-1 text-sm text-slate-500">القهاوي التي تحتاج متابعة سريعة قبل الانتهاء.</p>
                  </div>
                  <button type="button" onClick={() => setView('money')} className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">اذهب إلى المتابعة المالية</button>
                </div>
                <div className="mt-4 space-y-3">
                  {expiringSoon.map((cafe) => (
                    <div key={cafe.id} className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-700">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium text-slate-900">{cafe.display_name}</div>
                          <div className="text-xs text-slate-500">{cafe.slug}</div>
                        </div>
                        <Link href={`/platform/cafes/${cafe.id}`} className="rounded-2xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700">فتح القهوة</Link>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
                        <span>{paymentStateText(cafe.current_subscription)}</span>
                        <span>ينتهي: {formatDateTime(cafe.current_subscription?.ends_at)}</span>
                        <span>{countdownLabel(cafe.current_subscription?.countdown_seconds)}</span>
                      </div>
                    </div>
                  ))}
                  {expiringSoon.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">لا توجد اشتراكات تقترب من الانتهاء خلال 7 أيام.</div> : null}
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold text-slate-900">منتهي أو متأخر</h2>
                <div className="mt-4 space-y-3">
                  {expiredCafes.map((cafe) => (
                    <div key={cafe.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium">{cafe.display_name}</div>
                          <div className="text-xs opacity-80">{cafe.slug}</div>
                        </div>
                        <Link href={`/platform/cafes/${cafe.id}`} className="rounded-2xl border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-800">تفاصيل القهوة</Link>
                      </div>
                      <div className="mt-2 text-xs">انتهى في {formatDateTime(cafe.current_subscription?.ends_at)}</div>
                    </div>
                  ))}
                  {expiredCafes.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">لا توجد قهاوي منتهية الاشتراك الآن.</div> : null}
                </div>
              </section>
            </div>
          </div>
        ) : null}

        {view === 'cafes' ? (
          <div className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="lg:max-w-2xl">
                  <h2 className="text-lg font-bold text-slate-900">إنشاء قهوة جديدة</h2>
                  <p className="mt-1 text-sm text-slate-500">إنشاء القهوة يتضمن المالك الأساسي والاشتراك الأول مباشرة من نفس الخطوة.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setCreateCafe((value) => ({ ...value, ...applyPreset(30, true, 'trial') }))} className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">شهر مجاني</button>
                  <button type="button" onClick={() => setCreateCafe((value) => ({ ...value, ...applyPreset(30, false, 'active') }))} className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">شهر مدفوع</button>
                  <button type="button" onClick={() => setCreateCafe((value) => ({ ...value, ...applyPreset(90, false, 'active') }))} className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">3 أشهر</button>
                  <button type="button" onClick={() => setCreateCafe((value) => ({ ...value, ...applyPreset(365, false, 'active') }))} className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">سنة</button>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <input className="rounded-2xl border border-slate-200 px-4 py-3" placeholder="slug" value={createCafe.cafeSlug} onChange={(e) => setCreateCafe((v) => ({ ...v, cafeSlug: e.target.value }))} />
                <input className="rounded-2xl border border-slate-200 px-4 py-3" placeholder="اسم القهوة" value={createCafe.cafeDisplayName} onChange={(e) => setCreateCafe((v) => ({ ...v, cafeDisplayName: e.target.value }))} />
                <input className="rounded-2xl border border-slate-200 px-4 py-3" placeholder="اسم المالك" value={createCafe.ownerFullName} onChange={(e) => setCreateCafe((v) => ({ ...v, ownerFullName: e.target.value }))} />
                <input className="rounded-2xl border border-slate-200 px-4 py-3" placeholder="رقم المالك" value={createCafe.ownerPhone} onChange={(e) => setCreateCafe((v) => ({ ...v, ownerPhone: e.target.value }))} />
                <input className="rounded-2xl border border-slate-200 px-4 py-3 md:col-span-2 xl:col-span-1" type="password" placeholder="باسورد المالك" value={createCafe.ownerPassword} onChange={(e) => setCreateCafe((v) => ({ ...v, ownerPassword: e.target.value }))} />
                <input type="date" className="rounded-2xl border border-slate-200 px-4 py-3" value={createCafe.startsAt} onChange={(e) => setCreateCafe((v) => ({ ...v, startsAt: e.target.value }))} />
                <input type="date" className="rounded-2xl border border-slate-200 px-4 py-3" value={createCafe.endsAt} onChange={(e) => setCreateCafe((v) => ({ ...v, endsAt: e.target.value }))} />
                <input className="rounded-2xl border border-slate-200 px-4 py-3" placeholder="أيام السماح" value={createCafe.graceDays} onChange={(e) => setCreateCafe((v) => ({ ...v, graceDays: e.target.value }))} />
                <select className="rounded-2xl border border-slate-200 px-4 py-3" value={createCafe.status} onChange={(e) => setCreateCafe((v) => ({ ...v, status: e.target.value as SubscriptionStatus }))}>
                  <option value="trial">تجريبي</option>
                  <option value="active">نشط</option>
                  <option value="suspended">معلق</option>
                  <option value="expired">منتهي</option>
                </select>
                <input className="rounded-2xl border border-slate-200 px-4 py-3" placeholder="القيمة المدفوعة" value={createCafe.amountPaid} onChange={(e) => setCreateCafe((v) => ({ ...v, amountPaid: e.target.value }))} />
                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
                  <input type="checkbox" checked={createCafe.isComplimentary} onChange={(e) => setCreateCafe((v) => ({ ...v, isComplimentary: e.target.checked, amountPaid: e.target.checked ? '0' : v.amountPaid }))} />
                  مجاني / شهر استثنائي
                </label>
                <textarea className="min-h-24 rounded-2xl border border-slate-200 px-4 py-3 md:col-span-2 xl:col-span-4" placeholder="ملاحظة الاشتراك أو التحصيل" value={createCafe.notes} onChange={(e) => setCreateCafe((v) => ({ ...v, notes: e.target.value }))} />
              </div>
              <button disabled={busy} onClick={submitCreateCafe} className="mt-4 rounded-2xl bg-slate-900 px-4 py-3 text-white disabled:opacity-60">
                إنشاء القهوة والاشتراك الأول
              </button>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h2 className="text-lg font-bold">المقاهي</h2>
                  <p className="mt-1 text-sm text-slate-500">جدول إداري سريع يدعم الفهرسة والبحث والمتابعة على مستوى الاشتراك والحالة. العرض الافتراضي يركز على القهاوي المفعلة حتى تبقى الشاشة اليومية أنظف.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-3 xl:min-w-[720px]">
                  <input className="rounded-2xl border border-slate-200 px-4 py-3" placeholder="ابحث باسم القهوة أو الـ slug" value={search} onChange={(e) => setSearch(e.target.value)} />
                  <select className="rounded-2xl border border-slate-200 px-4 py-3" value={cafeStatusFilter} onChange={(e) => setCafeStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}>
                    <option value="all">كل الحالات</option>
                    <option value="active">المفعلة فقط</option>
                    <option value="inactive">المعطلة فقط</option>
                  </select>
                  <select className="rounded-2xl border border-slate-200 px-4 py-3" value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value as 'all' | 'paid' | 'free' | 'expired' | 'none')}>
                    <option value="all">كل الاشتراكات</option>
                    <option value="paid">مدفوع</option>
                    <option value="free">مجاني / تجريبي</option>
                    <option value="expired">منتهي</option>
                    <option value="none">بدون اشتراك</option>
                  </select>
                </div>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-right font-medium">القهوة</th>
                      <th className="px-3 py-2 text-right font-medium">الحالة</th>
                      <th className="px-3 py-2 text-right font-medium">الاشتراك</th>
                      <th className="px-3 py-2 text-right font-medium">القيمة</th>
                      <th className="px-3 py-2 text-right font-medium">آخر نشاط</th>
                      <th className="px-3 py-2 text-right font-medium">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCafes.map((cafe) => {
                      const subscription = cafe.current_subscription ?? null;
                      return (
                        <tr key={cafe.id} className={`border-t border-slate-100 align-top ${selectedCafeId === cafe.id ? 'bg-slate-50' : ''}`}>
                          <td className="px-3 py-3">
                            <button type="button" onClick={() => setSelectedCafeId(cafe.id)} className="text-right">
                              <div className="font-medium text-slate-900">{cafe.display_name}</div>
                              <div className="text-xs text-slate-500">{cafe.slug}</div>
                            </button>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                              <span>{cafe.owner_count ?? 0} مالك/شريك</span>
                              <span>{cafe.active_owner_count ?? 0} نشط</span>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${cafeStatusBadgeClass(cafe.is_active)}`}>{cafe.is_active ? 'مفعلة' : 'معطلة'}</div>
                            <div className="mt-2 text-xs text-slate-500">{paymentStateText(subscription)}</div>
                          </td>
                          <td className="px-3 py-3 text-slate-700">
                            {subscription ? (
                              <>
                                <div className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${subscriptionBadgeClass(subscription.effective_status)}`}>{subscription.effective_status}</div>
                                <div className="mt-2">حتى {formatDateTime(subscription.ends_at)}</div>
                                <div className="mt-1 text-xs text-slate-500">{countdownLabel(subscription.countdown_seconds)}</div>
                              </>
                            ) : <span className="text-slate-500">بدون اشتراك</span>}
                          </td>
                          <td className="px-3 py-3 text-slate-700">
                            {subscription ? (
                              <>
                                <div>{subscription.is_complimentary ? 'مجاني' : `${amountLabel(subscription.amount_paid)} ج.م`}</div>
                                {subscription.notes ? <div className="mt-1 text-xs text-slate-500">{subscription.notes}</div> : null}
                              </>
                            ) : '—'}
                          </td>
                          <td className="px-3 py-3 text-slate-700">{formatDateTime(cafe.last_activity_at ?? cafe.created_at)}</td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-2">
                              <Link href={`/platform/cafes/${cafe.id}`} className="rounded-2xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700">التفاصيل</Link>
                              <button type="button" disabled={busy} onClick={() => void submitToggleCafe(cafe.id, !cafe.is_active)} className={`rounded-2xl px-3 py-2 text-xs font-medium text-white ${cafe.is_active ? 'bg-rose-600' : 'bg-emerald-600'} disabled:opacity-60`}>
                                {cafe.is_active ? 'تعطيل' : 'تفعيل'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredCafes.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-8 text-center text-slate-500">لا توجد قهاوي مطابقة للفلترة الحالية.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            {selectedCafe ? (
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">القهوة المحددة</h2>
                    <div className="mt-2 text-base font-semibold">{selectedCafe.display_name}</div>
                    <div className="mt-1 text-sm text-slate-500">{selectedCafe.slug}</div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                      {(selectedCafe.owners ?? []).slice(0, 4).map((owner) => (
                        <span key={owner.id} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">{owner.full_name} — {ownerLabelText(owner.owner_label)}</span>
                      ))}
                    </div>
                  </div>
                  <Link href={`/platform/cafes/${selectedCafe.id}`} className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">فتح صفحة القهوة</Link>
                </div>
              </section>
            ) : null}
          </div>
        ) : null}

        {view === 'money' ? <MoneyFollowSection refreshKey={refreshKey} /> : null}
      </div>
    </main>
  );
}
