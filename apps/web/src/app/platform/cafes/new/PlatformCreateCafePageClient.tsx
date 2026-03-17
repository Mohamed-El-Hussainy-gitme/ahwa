'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  extractPlatformApiErrorMessage,
  isPlatformApiOk,
} from '@/lib/platform-auth/api';

type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'suspended';

type CreateCafeResponse = { ok: true; data?: { cafe_id?: string; database_key?: string } };

type OperationalDatabaseOption = {
  database_key: string;
  display_name: string;
  description: string | null;
  is_active: boolean;
  is_accepting_new_cafes: boolean;
  cafe_count: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCreateCafeResponse(value: unknown): value is CreateCafeResponse {
  if (!isRecord(value) || value.ok !== true) return false;
  if (typeof value.data === 'undefined') return true;
  return isRecord(value.data) &&
    (typeof value.data.cafe_id === 'undefined' || typeof value.data.cafe_id === 'string') &&
    (typeof value.data.database_key === 'undefined' || typeof value.data.database_key === 'string');
}

function isOperationalDatabaseOption(value: unknown): value is OperationalDatabaseOption {
  return (
    isRecord(value) &&
    typeof value.database_key === 'string' &&
    typeof value.display_name === 'string' &&
    (typeof value.description === 'string' || value.description === null) &&
    typeof value.is_active === 'boolean' &&
    typeof value.is_accepting_new_cafes === 'boolean' &&
    typeof value.cafe_count === 'number'
  );
}

type OperationalDatabasesResponse = { ok: true; items: OperationalDatabaseOption[] };

function isOperationalDatabasesResponse(value: unknown): value is OperationalDatabasesResponse {
  return isRecord(value) && value.ok === true && Array.isArray(value.items) && value.items.every(isOperationalDatabaseOption);
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

export default function PlatformCreateCafePageClient() {
  const router = useRouter();
  const defaults = useMemo(() => ({ ...applyPreset(30, true, 'trial'), notes: '' }), []);
  const [busy, setBusy] = useState(false);
  const [loadingDatabases, setLoadingDatabases] = useState(false);
  const [databaseOptions, setDatabaseOptions] = useState<OperationalDatabaseOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    cafeSlug: '',
    cafeDisplayName: '',
    ownerFullName: '',
    ownerPhone: '',
    ownerPassword: '',
    startsAt: defaults.startsAt,
    endsAt: defaults.endsAt,
    graceDays: defaults.graceDays,
    status: defaults.status,
    amountPaid: defaults.amountPaid,
    isComplimentary: defaults.isComplimentary,
    notes: defaults.notes,
    databaseKey: 'ops-db-01',
  });

  async function loadOperationalDatabases() {
    setLoadingDatabases(true);
    try {
      const response = await fetch('/api/platform/control-plane/operational-databases', {
        cache: 'no-store',
        credentials: 'include',
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok || !isPlatformApiOk(payload)) {
        throw new Error(extractPlatformApiErrorMessage(payload, 'LOAD_OPERATIONAL_DATABASES_FAILED'));
      }
      const items = isOperationalDatabasesResponse(payload)
        ? payload.items.filter((item) => item.is_active && item.is_accepting_new_cafes)
        : [];
      setDatabaseOptions(items);
      if (items.length > 0) {
        setForm((value) => ({
          ...value,
          databaseKey: value.databaseKey && items.some((item) => item.database_key === value.databaseKey)
            ? value.databaseKey
            : items[0]?.database_key ?? value.databaseKey,
        }));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'LOAD_OPERATIONAL_DATABASES_FAILED');
    } finally {
      setLoadingDatabases(false);
    }
  }

  useEffect(() => {
    void loadOperationalDatabases();
  }, []);

  async function submitCreateCafe() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch('/api/platform/cafes/create', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cafeSlug: form.cafeSlug,
          cafeDisplayName: form.cafeDisplayName,
          ownerFullName: form.ownerFullName,
          ownerPhone: form.ownerPhone,
          ownerPassword: form.ownerPassword,
          subscriptionStartsAt: fromDateInputValue(form.startsAt),
          subscriptionEndsAt: fromDateInputValue(form.endsAt),
          subscriptionGraceDays: Number(form.graceDays || 0),
          subscriptionStatus: form.status,
          subscriptionAmountPaid: Number(form.amountPaid || 0),
          subscriptionIsComplimentary: form.isComplimentary,
          subscriptionNotes: form.notes,
          databaseKey: form.databaseKey,
        }),
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok || !isPlatformApiOk(payload)) {
        throw new Error(extractPlatformApiErrorMessage(payload, 'CREATE_CAFE_FAILED'));
      }
      const createdCafeId = isCreateCafeResponse(payload) ? payload.data?.cafe_id ?? '' : '';
      setSuccess('تم إنشاء القهوة والاشتراك الأول بنجاح.');
      setForm({
        cafeSlug: '',
        cafeDisplayName: '',
        ownerFullName: '',
        ownerPhone: '',
        ownerPassword: '',
        startsAt: defaults.startsAt,
        endsAt: defaults.endsAt,
        graceDays: defaults.graceDays,
        status: defaults.status,
        amountPaid: defaults.amountPaid,
        isComplimentary: defaults.isComplimentary,
        notes: defaults.notes,
        databaseKey: databaseOptions[0]?.database_key ?? 'ops-db-01',
      });
      if (createdCafeId) {
        router.replace(`/platform/cafes?selected=${encodeURIComponent(createdCafeId)}`);
        router.refresh();
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'CREATE_CAFE_FAILED');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setForm((value) => ({ ...value, ...applyPreset(30, true, 'trial'), amountPaid: '0', notes: '' }))}
            className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700"
          >
            30 يوم مجاني
          </button>
          <button
            type="button"
            onClick={() => setForm((value) => ({ ...value, ...applyPreset(30, false, 'active') }))}
            className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700"
          >
            شهر مدفوع
          </button>
        </div>

        {loadingDatabases ? <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">جارٍ تحميل قواعد التشغيل...</div> : null}

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <input className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="slug القهوة" value={form.cafeSlug} onChange={(e) => setForm((v) => ({ ...v, cafeSlug: e.target.value }))} />
          <input className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="اسم القهوة" value={form.cafeDisplayName} onChange={(e) => setForm((v) => ({ ...v, cafeDisplayName: e.target.value }))} />
          <input className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="اسم المالك" value={form.ownerFullName} onChange={(e) => setForm((v) => ({ ...v, ownerFullName: e.target.value }))} />
          <input className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="رقم هاتف المالك" value={form.ownerPhone} onChange={(e) => setForm((v) => ({ ...v, ownerPhone: e.target.value }))} />
          <input className="rounded-2xl border border-slate-200 px-4 py-3 text-sm md:col-span-2" placeholder="باسورد المالك" type="password" value={form.ownerPassword} onChange={(e) => setForm((v) => ({ ...v, ownerPassword: e.target.value }))} />
          <input type="date" className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" value={form.startsAt} onChange={(e) => setForm((v) => ({ ...v, startsAt: e.target.value }))} />
          <input type="date" className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" value={form.endsAt} onChange={(e) => setForm((v) => ({ ...v, endsAt: e.target.value }))} />
          <input className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="أيام السماح" value={form.graceDays} onChange={(e) => setForm((v) => ({ ...v, graceDays: e.target.value }))} />
          <input className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="القيمة المدفوعة" value={form.amountPaid} onChange={(e) => setForm((v) => ({ ...v, amountPaid: e.target.value }))} />
          <select className="rounded-2xl border border-slate-200 px-4 py-3 text-sm md:col-span-2" value={form.databaseKey} onChange={(e) => setForm((v) => ({ ...v, databaseKey: e.target.value }))}>
            {databaseOptions.length === 0 ? (
              <option value="ops-db-01">ops-db-01</option>
            ) : databaseOptions.map((option) => (
              <option key={option.database_key} value={option.database_key}>
                {option.display_name} — {option.database_key} ({option.cafe_count})
              </option>
            ))}
          </select>
          <select className="rounded-2xl border border-slate-200 px-4 py-3 text-sm md:col-span-2" value={form.status} onChange={(e) => setForm((v) => ({ ...v, status: e.target.value as SubscriptionStatus }))}>
            <option value="trial">تجريبي</option>
            <option value="active">نشط</option>
            <option value="suspended">معلق</option>
            <option value="expired">منتهي</option>
          </select>
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 md:col-span-2">
            <input type="checkbox" checked={form.isComplimentary} onChange={(e) => setForm((v) => ({ ...v, isComplimentary: e.target.checked, amountPaid: e.target.checked ? '0' : v.amountPaid }))} />
            مجاني / استثنائي
          </label>
          <textarea className="min-h-28 rounded-2xl border border-slate-200 px-4 py-3 text-sm md:col-span-2" placeholder="ملاحظة الاشتراك أو التحصيل" value={form.notes} onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))} />
        </div>

        {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{success}</div> : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button disabled={busy} onClick={() => void submitCreateCafe()} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? 'جارٍ الإنشاء...' : 'إنشاء القهوة والاشتراك الأول'}
          </button>
          <button type="button" onClick={() => router.push('/platform/cafes')} className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
            العودة إلى سجل القهاوي
          </button>
        </div>
      </section>
    </div>
  );
}
