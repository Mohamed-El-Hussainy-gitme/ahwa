'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  extractPlatformApiErrorMessage,
  isPlatformApiOk,
} from '@/lib/platform-auth/api';
import { extractCafeListItems } from '@/lib/platform-data';

type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'suspended';

type CafeSubscriptionRow = {
  id: string;
  ends_at: string;
  effective_status: SubscriptionStatus;
  amount_paid: number;
  is_complimentary: boolean;
  notes: string | null;
  countdown_seconds: number;
};

type CafeOwnerRow = {
  id: string;
  full_name: string;
  phone: string;
  owner_label: 'owner' | 'partner';
  is_active: boolean;
};

type BindingStatus = 'bound' | 'unbound' | 'invalid';

type CafeDatabaseBinding = {
  database_key: string;
  binding_source: string;
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
  database_key?: string | null;
  database_binding?: CafeDatabaseBinding | null;
  binding_status?: BindingStatus;
};

type CafeListResponse = { ok: true; items: CafeRow[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return value === 'trial' || value === 'active' || value === 'expired' || value === 'suspended';
}

function isCafeOwnerRow(value: unknown): value is CafeOwnerRow {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.full_name === 'string' &&
    typeof value.phone === 'string' &&
    (value.owner_label === 'owner' || value.owner_label === 'partner') &&
    typeof value.is_active === 'boolean'
  );
}

function isCafeSubscriptionRow(value: unknown): value is CafeSubscriptionRow {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.ends_at === 'string' &&
    isSubscriptionStatus(value.effective_status) &&
    typeof value.amount_paid === 'number' &&
    typeof value.is_complimentary === 'boolean' &&
    (typeof value.notes === 'string' || value.notes === null) &&
    typeof value.countdown_seconds === 'number'
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
    (typeof value.last_activity_at === 'string' || value.last_activity_at === null || typeof value.last_activity_at === 'undefined') &&
    (typeof value.owner_count === 'number' || typeof value.owner_count === 'undefined') &&
    (typeof value.active_owner_count === 'number' || typeof value.active_owner_count === 'undefined') &&
    (typeof value.owners === 'undefined' || (Array.isArray(value.owners) && value.owners.every(isCafeOwnerRow))) &&
    (typeof value.current_subscription === 'undefined' || value.current_subscription === null || isCafeSubscriptionRow(value.current_subscription)) &&
    (typeof value.database_key === 'string' || value.database_key === null || typeof value.database_key === 'undefined') &&
    (typeof value.database_binding === 'undefined' ||
      value.database_binding === null ||
      (isRecord(value.database_binding) && typeof value.database_binding.database_key === 'string' && typeof value.database_binding.binding_source === 'string')) &&
    (typeof value.binding_status === 'undefined' || value.binding_status === 'bound' || value.binding_status === 'unbound' || value.binding_status === 'invalid')
  );
}

function isCafeListResponse(value: unknown): value is CafeListResponse {
  return isRecord(value) && value.ok === true && Array.isArray(value.items) && value.items.every(isCafeRow);
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

function countdownLabel(totalSeconds: number | null | undefined) {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(Number(totalSeconds))) : 0;
  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600);
  if (days > 0) return `${days} يوم و ${hours} ساعة`;
  const minutes = Math.floor((safe % 3600) / 60);
  return `${hours} ساعة و ${minutes} دقيقة`;
}

function cafeStatusBadgeClass(active: boolean) {
  return active
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-rose-200 bg-rose-50 text-rose-700';
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

function subscriptionStatusLabel(status: SubscriptionStatus) {
  switch (status) {
    case 'trial':
      return 'تجريبي';
    case 'active':
      return 'نشط';
    case 'expired':
      return 'منتهي';
    case 'suspended':
      return 'معلق';
  }
}

function bindingStatusLabel(cafe: CafeRow) {
  switch (cafe.binding_status) {
    case 'bound':
      return cafe.database_binding?.database_key ?? cafe.database_key ?? 'مرتبط';
    case 'invalid':
      return `ربط غير صالح${cafe.database_binding?.database_key ? ` (${cafe.database_binding.database_key})` : ''}`;
    case 'unbound':
      return 'غير مربوط';
    default:
      return cafe.database_binding?.database_key ?? cafe.database_key ?? 'غير مربوط';
  }
}

function bindingBadgeClass(status: BindingStatus | undefined) {
  switch (status) {
    case 'bound':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'invalid':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'unbound':
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600';
  }
}

export default function PlatformCafesPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [cafes, setCafes] = useState<CafeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(searchParams.get('query') ?? '');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const selectedCafeId = searchParams.get('selected') ?? '';
  const searchQuery = searchParams.get('query') ?? '';

  useEffect(() => {
    setSearch(searchQuery);
  }, [searchQuery]);

  const loadCafes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/platform/cafes/list', {
        cache: 'no-store',
        credentials: 'include',
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok || !isPlatformApiOk(payload)) {
        throw new Error(extractPlatformApiErrorMessage(payload, 'LOAD_CAFES_FAILED'));
      }
      const items = isCafeListResponse(payload) ? payload.items : extractCafeListItems(payload) as CafeRow[];
      setCafes(items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'LOAD_CAFES_FAILED');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCafes();
  }, [loadCafes]);

  const filteredCafes = useMemo(() => {
    const term = search.trim().toLowerCase();
    return cafes.filter((cafe) => {
      if (statusFilter === 'active' && !cafe.is_active) return false;
      if (statusFilter === 'inactive' && cafe.is_active) return false;
      if (!term) return true;
      return cafe.display_name.toLowerCase().includes(term) || cafe.slug.toLowerCase().includes(term);
    });
  }, [cafes, search, statusFilter]);

  const summary = useMemo(() => {
    const active = cafes.filter((cafe) => cafe.is_active).length;
    const inactive = cafes.length - active;
    const expiringSoon = cafes.filter(
      (cafe) => (cafe.current_subscription?.countdown_seconds ?? Number.MAX_SAFE_INTEGER) <= 7 * 86400,
    ).length;
    const invalidBinding = cafes.filter((cafe) => cafe.binding_status === 'invalid' || cafe.binding_status === 'unbound').length;
    return { active, inactive, expiringSoon, invalidBinding };
  }, [cafes]);

  const expiringSoonList = useMemo(
    () => cafes.filter((cafe) => (cafe.current_subscription?.countdown_seconds ?? Number.MAX_SAFE_INTEGER) <= 7 * 86400).slice(0, 6),
    [cafes],
  );

  const selectedCafe = useMemo(
    () => cafes.find((item) => item.id === selectedCafeId) ?? filteredCafes[0] ?? cafes[0] ?? null,
    [cafes, filteredCafes, selectedCafeId],
  );

  async function submitToggleCafe(cafeId: string, isActive: boolean) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/platform/cafes/toggle', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cafeId, isActive }),
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok || !isPlatformApiOk(payload)) {
        throw new Error(extractPlatformApiErrorMessage(payload, 'TOGGLE_CAFE_FAILED'));
      }
      await loadCafes();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'TOGGLE_CAFE_FAILED');
    } finally {
      setBusy(false);
    }
  }

  function selectCafe(cafeId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('selected', cafeId);
    if (search.trim()) {
      params.set('query', search.trim());
    } else {
      params.delete('query');
    }
    router.replace(`/platform/cafes?${params.toString()}`);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_380px]">
      <section className="space-y-6">
        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">قهاوي مفعلة</div>
            <div className="mt-2 text-3xl font-bold text-slate-900">{summary.active}</div>
            <div className="mt-2 text-xs text-slate-500">من أصل {cafes.length} قهوة</div>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">قهاوي معطلة</div>
            <div className="mt-2 text-3xl font-bold text-slate-900">{summary.inactive}</div>
            <div className="mt-2 text-xs text-slate-500">بحاجة مراجعة أو إعادة تفعيل</div>
          </div>
          <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <div className="text-sm text-amber-800">استحقاقات قريبة</div>
            <div className="mt-2 text-3xl font-bold text-amber-900">{summary.expiringSoon}</div>
            <div className="mt-2 text-xs text-amber-700">تنتهي خلال 7 أيام</div>
          </div>
          <div className="rounded-[24px] border border-sky-200 bg-sky-50 p-5 shadow-sm">
            <div className="text-sm text-sky-800">ربط يحتاج مراجعة</div>
            <div className="mt-2 text-3xl font-bold text-sky-900">{summary.invalidBinding}</div>
            <div className="mt-2 text-xs text-sky-700">غير مربوط أو به ربط غير صالح</div>
          </div>
        </section>

        <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-sm font-semibold text-indigo-600">سجل العملاء</div>
              <h2 className="mt-1 text-xl font-bold text-slate-900">فلترة السجل واختيار القهوة</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/platform/cafes/new" className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                إنشاء قهوة جديدة
              </Link>
              <button type="button" onClick={() => void loadCafes()} className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700">
                تحديث السجل
              </button>
            </div>
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <span className="text-slate-400">⌕</span>
              <input
                className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                placeholder="ابحث باسم القهوة أو الـ slug"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <select
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'all' | 'active' | 'inactive')}
            >
              <option value="all">كل القهاوي</option>
              <option value="active">المفعلة فقط</option>
              <option value="inactive">المعطلة فقط</option>
            </select>
          </div>
        </section>

        <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-right text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-4 py-3">القهوة</th>
                  <th className="px-4 py-3">الاشتراك</th>
                  <th className="px-4 py-3">الملاك</th>
                  <th className="px-4 py-3">آخر نشاط</th>
                  <th className="px-4 py-3">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredCafes.map((cafe) => {
                  const subscription = cafe.current_subscription ?? null;
                  const primaryOwner = cafe.owners?.[0] ?? null;
                  const isSelected = selectedCafe?.id === cafe.id;
                  return (
                    <tr key={cafe.id} className={isSelected ? 'border-t border-slate-100 bg-indigo-50/50' : 'border-t border-slate-100 bg-white'}>
                      <td className="px-4 py-4">
                        <button type="button" onClick={() => selectCafe(cafe.id)} className="text-right">
                          <div className="font-semibold text-slate-900">{cafe.display_name}</div>
                          <div className="mt-1 text-xs text-slate-500">{cafe.slug}</div>
                          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                            <span className={`rounded-full border px-2.5 py-1 font-semibold ${cafeStatusBadgeClass(cafe.is_active)}`}>
                              {cafe.is_active ? 'مفعلة' : 'معطلة'}
                            </span>
                            <span className={`rounded-full border px-2.5 py-1 font-semibold ${bindingBadgeClass(cafe.binding_status)}`}>
                              {cafe.binding_status === 'bound' ? 'مربوط' : cafe.binding_status === 'invalid' ? 'ربط غير صالح' : 'غير مربوط'}
                            </span>
                            {subscription ? (
                              <span className={`rounded-full border px-2.5 py-1 font-semibold ${subscriptionBadgeClass(subscription.effective_status)}`}>
                                {subscriptionStatusLabel(subscription.effective_status)}
                              </span>
                            ) : (
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-600">بدون اشتراك</span>
                            )}
                          </div>
                        </button>
                      </td>
                      <td className="px-4 py-4 text-slate-700">
                        {subscription ? (
                          <>
                            <div className="font-medium text-slate-900">حتى {formatDateTime(subscription.ends_at)}</div>
                            <div className="mt-1 text-xs text-slate-500">{countdownLabel(subscription.countdown_seconds)}</div>
                            <div className="mt-2 text-xs text-slate-500">{subscription.is_complimentary ? 'اشتراك مجاني' : `${amountLabel(subscription.amount_paid)} ج.م`}</div>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-4 text-slate-700">
                        <div className="font-medium text-slate-900">{primaryOwner?.full_name ?? '—'}</div>
                        <div className="mt-1 text-xs text-slate-500">{primaryOwner?.phone ?? 'لا يوجد مالك محدد'}</div>
                        <div className="mt-2 text-xs text-slate-500">{cafe.active_owner_count ?? 0}/{cafe.owner_count ?? 0} نشط</div>
                      </td>
                      <td className="px-4 py-4 text-slate-700">{formatDateTime(cafe.last_activity_at ?? cafe.created_at)}</td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <Link href={`/platform/cafes/${cafe.id}`} className="rounded-2xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700">
                            التفاصيل
                          </Link>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void submitToggleCafe(cafe.id, !cafe.is_active)}
                            className={`rounded-2xl px-3 py-2 text-xs font-medium text-white ${cafe.is_active ? 'bg-rose-600' : 'bg-emerald-600'} disabled:opacity-60`}
                          >
                            {cafe.is_active ? 'تعطيل' : 'تفعيل'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!loading && filteredCafes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-500">لا توجد قهاوي مطابقة للبحث أو الفلاتر الحالية.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {loading ? <div className="border-t border-slate-100 px-4 py-4 text-sm text-slate-500">جارٍ تحميل السجل...</div> : null}
        </section>
      </section>

      <aside className="space-y-6 xl:sticky xl:top-4 xl:self-start">
        {selectedCafe ? (
          <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-indigo-600">القهوة المحددة</div>
                <h3 className="mt-1 text-lg font-bold text-slate-900">ملف سريع</h3>
              </div>
              <Link href={`/platform/cafes/${selectedCafe.id}`} className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700">
                فتح التفاصيل
              </Link>
            </div>
            <div className="mt-4 rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <div className="font-semibold text-slate-900">{selectedCafe.display_name}</div>
              <div className="mt-1 text-xs text-slate-500">{selectedCafe.slug}</div>
              <div className="mt-2 text-xs text-slate-400">قاعدة التشغيل: {bindingStatusLabel(selectedCafe)}</div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-[20px] border border-slate-200 bg-white p-4">
                <div className="text-xs text-slate-500">المالك الرئيسي</div>
                <div className="mt-1 font-semibold text-slate-900">{selectedCafe.owners?.[0]?.full_name ?? '—'}</div>
                <div className="mt-1 text-xs text-slate-500">{selectedCafe.owners?.[0]?.phone ?? 'لا يوجد'}</div>
              </div>
              <div className="rounded-[20px] border border-slate-200 bg-white p-4">
                <div className="text-xs text-slate-500">آخر نشاط</div>
                <div className="mt-1 font-semibold text-slate-900">{formatDateTime(selectedCafe.last_activity_at ?? selectedCafe.created_at)}</div>
              </div>
              <div className="rounded-[20px] border border-slate-200 bg-white p-4">
                <div className="text-xs text-slate-500">الاشتراك</div>
                <div className="mt-1 font-semibold text-slate-900">{selectedCafe.current_subscription ? countdownLabel(selectedCafe.current_subscription.countdown_seconds) : 'بدون اشتراك'}</div>
                {selectedCafe.current_subscription && !selectedCafe.current_subscription.is_complimentary ? (
                  <div className="mt-1 text-xs text-slate-500">{amountLabel(selectedCafe.current_subscription.amount_paid)} ج.م</div>
                ) : null}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void submitToggleCafe(selectedCafe.id, !selectedCafe.is_active)}
                className={`rounded-2xl px-4 py-2 text-sm font-semibold text-white ${selectedCafe.is_active ? 'bg-rose-600' : 'bg-emerald-600'} disabled:opacity-60`}
              >
                {selectedCafe.is_active ? 'تعطيل القهوة' : 'تفعيل القهوة'}
              </button>
              <Link href="/platform/money" className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
                متابعة التحصيل
              </Link>
            </div>
          </section>
        ) : null}

        <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-indigo-600">استحقاقات قريبة</div>
          <h3 className="mt-1 text-lg font-bold text-slate-900">أولوية الأسبوع</h3>
          <div className="mt-4 space-y-3">
            {expiringSoonList.map((cafe) => (
              <button
                key={cafe.id}
                type="button"
                onClick={() => selectCafe(cafe.id)}
                className="w-full rounded-[20px] border border-slate-200 bg-slate-50 p-4 text-right transition hover:border-slate-300 hover:bg-white"
              >
                <div className="font-semibold text-slate-900">{cafe.display_name}</div>
                <div className="mt-1 text-xs text-slate-500">{cafe.slug}</div>
                <div className="mt-2 text-sm text-slate-700">حتى {formatDateTime(cafe.current_subscription?.ends_at)}</div>
                <div className="mt-1 text-xs text-slate-500">{countdownLabel(cafe.current_subscription?.countdown_seconds ?? 0)}</div>
              </button>
            ))}
            {expiringSoonList.length === 0 ? <div className="rounded-[20px] border border-dashed border-slate-300 p-4 text-sm text-slate-500">لا توجد استحقاقات قريبة الآن.</div> : null}
          </div>
        </section>
      </aside>
    </div>
  );
}
