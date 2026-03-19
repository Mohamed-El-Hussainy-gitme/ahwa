'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  extractPlatformApiErrorMessage,
  isPlatformApiOk,
} from '@/lib/platform-auth/api';
import { extractCreatedCafeId, extractOperationalDatabaseOptions } from '@/lib/platform-data';
import type { PlatformCafeLoadTier, PlatformOperationalDatabaseOption } from '@ahwa/shared';

type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'suspended';

type CreateCafeResponse = {
  ok: true;
  data?: {
    cafe_id?: string;
    database_key?: string;
    password_setup_code?: string | null;
    password_setup_expires_at?: string | null;
  };
};

type PasswordSetupInvite = {
  cafeSlug: string;
  ownerPhone: string;
  code: string;
  expiresAt: string | null;
};

type RecommendationResponse = {
  ok: true;
  data?: {
    ok?: boolean;
    database_key?: string;
    requested_load_units?: number;
  } | null;
};

type FormState = {
  cafeSlug: string;
  cafeDisplayName: string;
  ownerFullName: string;
  ownerPhone: string;
  startsAt: string;
  endsAt: string;
  graceDays: string;
  status: SubscriptionStatus;
  amountPaid: string;
  isComplimentary: boolean;
  notes: string;
  databaseKey: string;
  cafeLoadTier: PlatformCafeLoadTier;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCreateCafeResponse(value: unknown): value is CreateCafeResponse {
  if (!isRecord(value) || value.ok !== true) return false;
  if (typeof value.data === 'undefined') return true;
  return isRecord(value.data);
}

function isRecommendationResponse(value: unknown): value is RecommendationResponse {
  return isRecord(value) && value.ok === true;
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

function loadTierLabel(value: PlatformCafeLoadTier) {
  switch (value) {
    case 'medium':
      return 'متوسطة';
    case 'heavy':
      return 'مرتفعة';
    case 'enterprise':
      return 'كبيرة جدًا';
    default:
      return 'خفيفة';
  }
}

function capacityStateLabel(value: PlatformOperationalDatabaseOption['capacity_state']) {
  switch (value) {
    case 'warning':
      return 'تحذير';
    case 'critical':
      return 'حرجة';
    case 'hot':
      return 'مزدحمة ثقيل';
    case 'full':
      return 'ممتلئة';
    case 'draining':
      return 'تصريف';
    case 'inactive':
      return 'غير نشطة';
    default:
      return 'مستقرة';
  }
}

function capacityStateClass(value: PlatformOperationalDatabaseOption['capacity_state']) {
  switch (value) {
    case 'warning':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'critical':
    case 'hot':
    case 'full':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'draining':
    case 'inactive':
      return 'border-slate-200 bg-slate-100 text-slate-600';
    default:
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
}

export default function PlatformCreateCafePageClient() {
  const router = useRouter();
  const defaults = useMemo(() => ({ ...applyPreset(30, true, 'trial'), notes: '' }), []);
  const [busy, setBusy] = useState(false);
  const [loadingDatabases, setLoadingDatabases] = useState(false);
  const [databaseOptions, setDatabaseOptions] = useState<PlatformOperationalDatabaseOption[]>([]);
  const [recommendedDatabaseKey, setRecommendedDatabaseKey] = useState<string>('');
  const [recommendedLoadUnits, setRecommendedLoadUnits] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [invite, setInvite] = useState<PasswordSetupInvite | null>(null);
  const [form, setForm] = useState<FormState>({
    cafeSlug: '',
    cafeDisplayName: '',
    ownerFullName: '',
    ownerPhone: '',
    startsAt: defaults.startsAt,
    endsAt: defaults.endsAt,
    graceDays: defaults.graceDays,
    status: defaults.status,
    amountPaid: defaults.amountPaid,
    isComplimentary: defaults.isComplimentary,
    notes: defaults.notes,
    databaseKey: '',
    cafeLoadTier: 'small',
  });

  async function loadOperationalDatabases() {
    setLoadingDatabases(true);
    setError(null);
    try {
      const response = await fetch('/api/platform/control-plane/operational-databases', {
        cache: 'no-store',
        credentials: 'include',
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok || !isPlatformApiOk(payload)) {
        throw new Error(extractPlatformApiErrorMessage(payload, 'LOAD_OPERATIONAL_DATABASES_FAILED'));
      }
      const items = extractOperationalDatabaseOptions(payload).filter((item) => item.is_active);
      setDatabaseOptions(items);
      setForm((value) => {
        const currentValid = value.databaseKey && items.some((item) => item.database_key === value.databaseKey);
        return {
          ...value,
          databaseKey: currentValid ? value.databaseKey : items.find((item) => item.is_accepting_new_cafes)?.database_key ?? items[0]?.database_key ?? '',
        };
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'LOAD_OPERATIONAL_DATABASES_FAILED');
    } finally {
      setLoadingDatabases(false);
    }
  }

  useEffect(() => {
    void loadOperationalDatabases();
  }, []);

  useEffect(() => {
    async function loadRecommendation() {
      try {
        const response = await fetch('/api/platform/control-plane/operational-databases/recommend', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ cafeLoadTier: form.cafeLoadTier }),
        });
        const payload: unknown = await response.json().catch(() => ({}));
        if (!response.ok || !isPlatformApiOk(payload)) {
          throw new Error(extractPlatformApiErrorMessage(payload, 'LOAD_DATABASE_RECOMMENDATION_FAILED'));
        }
        const envelope = payload as RecommendationResponse;
        const databaseKey = isRecommendationResponse(payload) && envelope.data?.ok === true && typeof envelope.data.database_key === 'string'
          ? envelope.data.database_key
          : '';
        const loadUnits = isRecommendationResponse(payload) && typeof envelope.data?.requested_load_units === 'number'
          ? envelope.data.requested_load_units
          : 1;
        setRecommendedDatabaseKey(databaseKey);
        setRecommendedLoadUnits(loadUnits);
        if (databaseKey) {
          setForm((value) => {
            if (!value.databaseKey || value.databaseKey === recommendedDatabaseKey) {
              return { ...value, databaseKey };
            }
            return value;
          });
        }
      } catch {
        setRecommendedDatabaseKey('');
        setRecommendedLoadUnits(form.cafeLoadTier === 'enterprise' ? 15 : form.cafeLoadTier === 'heavy' ? 8 : form.cafeLoadTier === 'medium' ? 3 : 1);
      }
    }

    if (databaseOptions.length > 0) {
      void loadRecommendation();
    }
  }, [form.cafeLoadTier, databaseOptions.length]);

  const selectedDatabase = databaseOptions.find((option) => option.database_key === form.databaseKey) ?? null;
  const recommendedDatabase = databaseOptions.find((option) => option.database_key === recommendedDatabaseKey) ?? null;

  async function submitCreateCafe() {
    if (!form.databaseKey) {
      setError('لا توجد قاعدة تشغيل متاحة حاليًا.');
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);
    setInvite(null);
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
          subscriptionStartsAt: fromDateInputValue(form.startsAt),
          subscriptionEndsAt: fromDateInputValue(form.endsAt),
          subscriptionGraceDays: Number(form.graceDays || 0),
          subscriptionStatus: form.status,
          subscriptionAmountPaid: Number(form.amountPaid || 0),
          subscriptionIsComplimentary: form.isComplimentary,
          subscriptionNotes: form.notes,
          databaseKey: form.databaseKey,
          cafeLoadTier: form.cafeLoadTier,
        }),
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok || !isPlatformApiOk(payload)) {
        throw new Error(extractPlatformApiErrorMessage(payload, 'CREATE_CAFE_FAILED'));
      }
      extractCreatedCafeId(payload);
      const setupCode = isCreateCafeResponse(payload) ? payload.data?.password_setup_code ?? null : null;
      const setupExpiresAt = isCreateCafeResponse(payload) ? payload.data?.password_setup_expires_at ?? null : null;
      setSuccess('تم إنشاء القهوة وربطها بالشارد المناسبة بنجاح.');
      if (setupCode) {
        setInvite({
          cafeSlug: form.cafeSlug,
          ownerPhone: form.ownerPhone,
          code: setupCode,
          expiresAt: setupExpiresAt ?? null,
        });
      }
      setForm({
        cafeSlug: '',
        cafeDisplayName: '',
        ownerFullName: '',
        ownerPhone: '',
        startsAt: defaults.startsAt,
        endsAt: defaults.endsAt,
        graceDays: defaults.graceDays,
        status: defaults.status,
        amountPaid: defaults.amountPaid,
        isComplimentary: defaults.isComplimentary,
        notes: defaults.notes,
        databaseKey: recommendedDatabaseKey || databaseOptions.find((item) => item.is_accepting_new_cafes)?.database_key || '',
        cafeLoadTier: 'small',
      });
      await loadOperationalDatabases();
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
          <button type="button" onClick={() => setForm((value) => ({ ...value, ...applyPreset(30, true, 'trial'), amountPaid: '0', notes: '' }))} className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700">30 يوم مجاني</button>
          <button type="button" onClick={() => setForm((value) => ({ ...value, ...applyPreset(30, false, 'active') }))} className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700">شهر مدفوع</button>
          <button type="button" onClick={() => void loadOperationalDatabases()} className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700">تحديث الشاردات</button>
        </div>

        {loadingDatabases ? <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">جارٍ تحميل الشاردات...</div> : null}

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <input className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="slug القهوة" value={form.cafeSlug} onChange={(e) => setForm((v) => ({ ...v, cafeSlug: e.target.value }))} />
          <input className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="اسم القهوة" value={form.cafeDisplayName} onChange={(e) => setForm((v) => ({ ...v, cafeDisplayName: e.target.value }))} />
          <input className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="اسم المالك" value={form.ownerFullName} onChange={(e) => setForm((v) => ({ ...v, ownerFullName: e.target.value }))} />
          <input className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="رقم هاتف المالك" value={form.ownerPhone} onChange={(e) => setForm((v) => ({ ...v, ownerPhone: e.target.value }))} />
          <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 md:col-span-2">
            إصدار القهوة الجديدة يعتمد على مستوى الحمل المتوقع، ثم يرشّح الشارد الأنسب تلقائيًا. يمكنك التعديل يدويًا عند الحاجة.
          </div>
          <select className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" value={form.cafeLoadTier} onChange={(e) => setForm((v) => ({ ...v, cafeLoadTier: e.target.value as PlatformCafeLoadTier }))}>
            <option value="small">خفيفة</option>
            <option value="medium">متوسطة</option>
            <option value="heavy">مرتفعة</option>
            <option value="enterprise">كبيرة جدًا</option>
          </select>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            الحمل المحجوز لهذه القهوة: <strong>{recommendedLoadUnits}</strong> وحدة
          </div>
          <input type="date" className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" value={form.startsAt} onChange={(e) => setForm((v) => ({ ...v, startsAt: e.target.value }))} />
          <input type="date" className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" value={form.endsAt} onChange={(e) => setForm((v) => ({ ...v, endsAt: e.target.value }))} />
          <input className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="أيام السماح" value={form.graceDays} onChange={(e) => setForm((v) => ({ ...v, graceDays: e.target.value }))} />
          <input className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="القيمة المدفوعة" value={form.amountPaid} onChange={(e) => setForm((v) => ({ ...v, amountPaid: e.target.value }))} />
          <select className="rounded-2xl border border-slate-200 px-4 py-3 text-sm md:col-span-2 disabled:bg-slate-100 disabled:text-slate-500" value={form.databaseKey} disabled={loadingDatabases || databaseOptions.length === 0} onChange={(e) => setForm((v) => ({ ...v, databaseKey: e.target.value }))}>
            {databaseOptions.length === 0 ? <option value="">لا توجد شاردات متاحة حاليًا</option> : databaseOptions.map((option) => (
              <option key={option.database_key} value={option.database_key}>
                {option.display_name} — {option.database_key} ({option.total_load_units ?? 0}/{option.max_load_units ?? 0})
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
          <textarea className="min-h-28 rounded-2xl border border-slate-200 px-4 py-3 text-sm md:col-span-2" placeholder="ملاحظة الاشتراك أو سياسة التوزيع" value={form.notes} onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))} />
        </div>

        {(recommendedDatabase || selectedDatabase) ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {recommendedDatabase ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <div className="font-semibold">الترشيح الحالي</div>
                <div className="mt-2">الشارد: <strong>{recommendedDatabase.display_name}</strong> ({recommendedDatabase.database_key})</div>
                <div className="mt-1">الحمل: {recommendedDatabase.total_load_units ?? 0}/{recommendedDatabase.max_load_units ?? 0} وحدة</div>
                <div className="mt-1">نسبة الاستخدام: {typeof recommendedDatabase.load_percent === 'number' ? `${recommendedDatabase.load_percent.toFixed(2)}%` : '—'}</div>
                <div className="mt-1">التصنيف المطلوب: {loadTierLabel(form.cafeLoadTier)}</div>
              </div>
            ) : null}
            {selectedDatabase ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold">الشارد المختارة</div>
                  <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${capacityStateClass(selectedDatabase.capacity_state)}`}>{capacityStateLabel(selectedDatabase.capacity_state)}</span>
                </div>
                <div className="mt-2">{selectedDatabase.display_name} — {selectedDatabase.database_key}</div>
                <div className="mt-1">عدد القهاوي: {selectedDatabase.cafe_count}</div>
                <div className="mt-1">الحمل: {selectedDatabase.total_load_units ?? 0}/{selectedDatabase.max_load_units ?? 0} وحدة</div>
                <div className="mt-1">القهاوي الثقيلة: {selectedDatabase.heavy_cafe_count ?? 0}{typeof selectedDatabase.max_heavy_cafes === 'number' ? ` / ${selectedDatabase.max_heavy_cafes}` : ''}</div>
                {selectedDatabase.scale_notes ? <div className="mt-2 text-xs text-slate-600">{selectedDatabase.scale_notes}</div> : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{success}</div> : null}
        {invite ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="font-semibold">كود تفعيل كلمة المرور للمالك</div>
            <div className="mt-2">القهوة: <strong>{invite.cafeSlug}</strong></div>
            <div>الهاتف: <strong>{invite.ownerPhone}</strong></div>
            <div className="mt-3 rounded-2xl border border-amber-300 bg-white px-4 py-3 text-center text-lg font-bold tracking-[0.3em]">{invite.code}</div>
            <div className="mt-2 text-xs text-amber-800">الصلاحية حتى {formatDateTime(invite.expiresAt)}.</div>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button disabled={busy || loadingDatabases || databaseOptions.length === 0 || !form.databaseKey} onClick={() => void submitCreateCafe()} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? 'جارٍ الإنشاء...' : 'إنشاء القهوة'}
          </button>
          <button type="button" onClick={() => router.push('/platform/cafes')} className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
            العودة إلى سجل القهاوي
          </button>
        </div>
      </section>
    </div>
  );
}
