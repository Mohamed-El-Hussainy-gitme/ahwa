'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  extractPlatformApiErrorMessage,
  isPlatformApiOk,
} from '@/lib/platform-auth/api';

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
    (typeof value.current_subscription === 'undefined' || value.current_subscription === null || isCafeSubscriptionRow(value.current_subscription))
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

export default function PlatformCafesPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [cafes, setCafes] = useState<CafeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const selectedCafeId = searchParams.get('selected') ?? '';

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
      setCafes(isCafeListResponse(payload) ? payload.items : []);
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

  const expiringSoon = useMemo(
    () => cafes.filter((cafe) => (cafe.current_subscription?.countdown_seconds ?? Number.MAX_SAFE_INTEGER) <= 7 * 86400),
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

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_380px]">
      <section className="space-y-6">
        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
        <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-sm font-semibold text-indigo-600">Cafes Registry</div>
              <h2 className="mt-1 text-xl font-bold text-slate-900">سجل القهاوي</h2>
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
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'all' | 'active' | 'inactive')}
            >
              <option value="all">كل القهاوي</option>
              <option value="active">المفعلة فقط</option>
              <option value="inactive">المعطلة فقط</option>
            </select>
          </div>
        </div>

        <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-right text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-4 py-3">القهوة</th>
                  <th className="px-4 py-3">المالك الرئيسي</th>
                  <th className="px-4 py-3">الاشتراك</th>
                  <th className="px-4 py-3">التحصيل</th>
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
                    <tr key={cafe.id} className={`border-t border-slate-100 ${isSelected ? 'bg-sky-50/60' : 'bg-white'}`}>
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          onClick={() => router.replace(`/platform/cafes?selected=${encodeURIComponent(cafe.id)}`)}
                          className="text-right"
                        >
                          <div className="font-semibold text-slate-900">{cafe.display_name}</div>
                          <div className="mt-1 text-xs text-slate-500">{cafe.slug}</div>
                        </button>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          <span className={`rounded-full border px-2 py-1 font-semibold ${cafeStatusBadgeClass(cafe.is_active)}`}>
                            {cafe.is_active ? 'مفعلة' : 'معطلة'}
                          </span>
                          {subscription ? (
                            <span className={`rounded-full border px-2 py-1 font-semibold ${subscriptionBadgeClass(subscription.effective_status)}`}>
                              {subscription.effective_status}
                            </span>
                          ) : (
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 font-semibold text-slate-600">بدون اشتراك</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-slate-700">
                        <div className="font-medium text-slate-900">{primaryOwner?.full_name ?? '—'}</div>
                        <div className="mt-1 text-xs text-slate-500">{primaryOwner?.phone ?? 'لا يوجد مالك محدد'}</div>
                        <div className="mt-2 text-xs text-slate-500">{cafe.active_owner_count ?? 0}/{cafe.owner_count ?? 0} نشط</div>
                      </td>
                      <td className="px-4 py-4 text-slate-700">
                        {subscription ? (
                          <>
                            <div>حتى {formatDateTime(subscription.ends_at)}</div>
                            <div className="mt-1 text-xs text-slate-500">{countdownLabel(subscription.countdown_seconds)}</div>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-4 text-slate-700">
                        {subscription ? (
                          <>
                            <div>{subscription.is_complimentary ? 'مجاني / استثنائي' : `${amountLabel(subscription.amount_paid)} ج.م`}</div>
                            {subscription.notes ? <div className="mt-1 text-xs text-slate-500">{subscription.notes}</div> : null}
                          </>
                        ) : (
                          '—'
                        )}
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
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-500">لا توجد قهاوي مطابقة للبحث أو الفلاتر الحالية.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {loading ? <div className="border-t border-slate-100 px-4 py-4 text-sm text-slate-500">جارٍ تحميل السجل...</div> : null}
        </div>
      </section>

      <aside className="space-y-6">
        {selectedCafe ? (
          <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-indigo-600">Selected Cafe</div>
            <h3 className="mt-1 text-lg font-bold text-slate-900">القهوة المحددة</h3>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="font-semibold text-slate-900">{selectedCafe.display_name}</div>
              <div className="mt-1 text-xs text-slate-500">{selectedCafe.slug}</div>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <div>المالك: {selectedCafe.owners?.[0]?.full_name ?? '—'}</div>
                <div>آخر نشاط: {formatDateTime(selectedCafe.last_activity_at ?? selectedCafe.created_at)}</div>
                <div>الاشتراك: {selectedCafe.current_subscription ? countdownLabel(selectedCafe.current_subscription.countdown_seconds) : 'بدون اشتراك'}</div>
              </div>
              <div className="mt-4 flex gap-2">
                <Link href={`/platform/cafes/${selectedCafe.id}`} className="flex-1 rounded-2xl bg-slate-900 px-4 py-2 text-center text-sm font-semibold text-white">
                  فتح التفاصيل
                </Link>
                <Link href="/platform/money" className="flex-1 rounded-2xl border border-slate-300 px-4 py-2 text-center text-sm font-semibold text-slate-700">
                  متابعة التحصيل
                </Link>
              </div>
            </div>
          </section>
        ) : null}

        <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-indigo-600">Focus Queue</div>
          <h3 className="mt-1 text-lg font-bold text-slate-900">استحقاقات قريبة</h3>
          <div className="mt-4 space-y-3">
            {expiringSoon.slice(0, 8).map((cafe) => (
              <button
                key={cafe.id}
                type="button"
                onClick={() => router.replace(`/platform/cafes?selected=${encodeURIComponent(cafe.id)}`)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-right"
              >
                <div className="font-semibold text-slate-900">{cafe.display_name}</div>
                <div className="mt-1 text-xs text-slate-500">{cafe.slug}</div>
                <div className="mt-2 text-sm text-slate-700">{formatDateTime(cafe.current_subscription?.ends_at)}</div>
                <div className="mt-1 text-xs text-slate-500">{countdownLabel(cafe.current_subscription?.countdown_seconds ?? 0)}</div>
              </button>
            ))}
            {expiringSoon.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">لا توجد استحقاقات قريبة الآن.</div> : null}
          </div>
        </section>
      </aside>
    </div>
  );
}
