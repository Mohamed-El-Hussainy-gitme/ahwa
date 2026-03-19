'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  extractPlatformApiErrorMessage,
  isPlatformApiOk,
  type PlatformApiEnvelope,
} from '@/lib/platform-auth/api';
import { extractOperationalDatabaseOptions } from '@/lib/platform-data';
import type { PlatformOperationalDatabaseOption } from '@ahwa/shared';

type DatabaseCapacityData = {
  used_bytes: number;
  used_pretty: string;
  capacity_bytes: number | null;
  capacity_pretty: string | null;
  usage_percent: number | null;
  database_name: string;
};

type DatabaseCapacityResponse = {
  ok: true;
  data: DatabaseCapacityData | null;
};

type PolicyDraft = {
  maxLoadUnits: string;
  warningLoadPercent: string;
  criticalLoadPercent: string;
  maxCafes: string;
  maxHeavyCafes: string;
  isAcceptingNewCafes: boolean;
  scaleNotes: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDatabaseCapacityData(value: unknown): value is DatabaseCapacityData {
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

function capacityStateLabel(value: PlatformOperationalDatabaseOption['capacity_state']) {
  switch (value) {
    case 'warning':
      return 'تحذير';
    case 'critical':
      return 'حرجة';
    case 'hot':
      return 'ساخنة';
    case 'full':
      return 'ممتلئة';
    case 'draining':
      return 'تصريف';
    case 'inactive':
      return 'معطلة';
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

function draftFromOption(option: PlatformOperationalDatabaseOption): PolicyDraft {
  return {
    maxLoadUnits: typeof option.max_load_units === 'number' ? String(option.max_load_units) : '400',
    warningLoadPercent: typeof option.warning_load_percent === 'number' ? String(option.warning_load_percent) : '75',
    criticalLoadPercent: typeof option.critical_load_percent === 'number' ? String(option.critical_load_percent) : '90',
    maxCafes: typeof option.max_cafes === 'number' ? String(option.max_cafes) : '',
    maxHeavyCafes: typeof option.max_heavy_cafes === 'number' ? String(option.max_heavy_cafes) : '',
    isAcceptingNewCafes: option.is_accepting_new_cafes,
    scaleNotes: option.scale_notes ?? '',
  };
}

function toNullableNumber(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function PlatformSettingsPageClient() {
  const [capacityInput, setCapacityInput] = useState('');
  const [capacityData, setCapacityData] = useState<DatabaseCapacityData | null>(null);
  const [databases, setDatabases] = useState<PlatformOperationalDatabaseOption[]>([]);
  const [policyDrafts, setPolicyDrafts] = useState<Record<string, PolicyDraft>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [policyBusyByKey, setPolicyBusyByKey] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewResponse, databasesResponse] = await Promise.all([
        fetch('/api/platform/overview', { cache: 'no-store', credentials: 'include' }),
        fetch('/api/platform/control-plane/operational-databases', { cache: 'no-store', credentials: 'include' }),
      ]);
      const overviewPayload: unknown = await overviewResponse.json().catch(() => ({}));
      if (!overviewResponse.ok || !isPlatformApiOk(overviewPayload)) {
        throw new Error(extractPlatformApiErrorMessage(overviewPayload, 'LOAD_DATABASE_CAPACITY_FAILED'));
      }
      const overviewEnvelope = overviewPayload as PlatformApiEnvelope<Record<string, unknown> | null>;
      const overviewData = isRecord(overviewEnvelope.data) ? overviewEnvelope.data.database_usage : null;
      if (isDatabaseCapacityData(overviewData)) {
        setCapacityData(overviewData);
        setCapacityInput(typeof overviewData.capacity_bytes === 'number' ? String(overviewData.capacity_bytes) : '');
      } else {
        setCapacityData(null);
        setCapacityInput('');
      }

      const databasesPayload: unknown = await databasesResponse.json().catch(() => ({}));
      if (!databasesResponse.ok || !isPlatformApiOk(databasesPayload)) {
        throw new Error(extractPlatformApiErrorMessage(databasesPayload, 'LOAD_OPERATIONAL_DATABASES_FAILED'));
      }
      const items = extractOperationalDatabaseOptions(databasesPayload);
      setDatabases(items);
      setPolicyDrafts(Object.fromEntries(items.map((item) => [item.database_key, draftFromOption(item)])));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'LOAD_PLATFORM_SETTINGS_FAILED');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const usageWidth = useMemo(() => {
    const percent = typeof capacityData?.usage_percent === 'number' ? Math.max(0, Math.min(100, capacityData.usage_percent)) : 0;
    return `${percent}%`;
  }, [capacityData?.usage_percent]);

  async function submitCapacity() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const normalized = capacityInput.trim() === '' ? null : Number(capacityInput.trim());
      const response = await fetch('/api/platform/settings/database-capacity', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ capacityBytes: normalized }),
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok || !isPlatformApiOk(payload)) {
        throw new Error(extractPlatformApiErrorMessage(payload, 'SAVE_DATABASE_CAPACITY_FAILED'));
      }
      setSuccess('تم تحديث حد السعة العامة بنجاح.');
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'SAVE_DATABASE_CAPACITY_FAILED');
    } finally {
      setBusy(false);
    }
  }

  async function submitPolicy(databaseKey: string) {
    const draft = policyDrafts[databaseKey];
    if (!draft) return;
    setPolicyBusyByKey((value) => ({ ...value, [databaseKey]: true }));
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch('/api/platform/control-plane/operational-databases/policy', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          databaseKey,
          maxLoadUnits: toNullableNumber(draft.maxLoadUnits),
          warningLoadPercent: toNullableNumber(draft.warningLoadPercent),
          criticalLoadPercent: toNullableNumber(draft.criticalLoadPercent),
          maxCafes: toNullableNumber(draft.maxCafes),
          maxHeavyCafes: toNullableNumber(draft.maxHeavyCafes),
          isAcceptingNewCafes: draft.isAcceptingNewCafes,
          scaleNotes: draft.scaleNotes,
        }),
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok || !isPlatformApiOk(payload)) {
        throw new Error(extractPlatformApiErrorMessage(payload, 'SAVE_SCALE_POLICY_FAILED'));
      }
      setSuccess(`تم تحديث سياسة الشارد ${databaseKey}.`);
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'SAVE_SCALE_POLICY_FAILED');
    } finally {
      setPolicyBusyByKey((value) => ({ ...value, [databaseKey]: false }));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void load()} className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700">
          تحديث القراءة
        </button>
      </div>

      {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">جارٍ تحميل سياسات السعة...</div> : null}
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{success}</div> : null}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-indigo-600">Global Capacity</div>
          <h2 className="mt-1 text-xl font-bold text-slate-900">سعة قاعدة البيانات العامة</h2>
          {capacityData ? (
            <div className="mt-5 space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs text-slate-500">المستخدم حاليًا</div><div className="mt-1 text-lg font-bold text-slate-900">{capacityData.used_pretty}</div></div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs text-slate-500">الحد الأقصى</div><div className="mt-1 text-lg font-bold text-slate-900">{capacityData.capacity_pretty ?? 'غير محدد'}</div></div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs text-slate-500">قاعدة البيانات</div><div className="mt-1 text-lg font-bold text-slate-900">{capacityData.database_name}</div></div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3 text-sm"><span className="font-medium text-slate-700">نسبة الاستخدام</span><span className="font-semibold text-slate-900">{typeof capacityData.usage_percent === 'number' ? `${capacityData.usage_percent.toFixed(2)}%` : 'غير محسوبة'}</span></div>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600" style={{ width: usageWidth }} /></div>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-indigo-600">Capacity Limit</div>
          <h2 className="mt-1 text-lg font-bold text-slate-900">تحديث الحد الأقصى العام</h2>
          <p className="mt-2 text-sm text-slate-500">هذا الحد يخص قراءة لوحة المنصة العامة، وليس سياسة توزيع الشاردات.</p>
          <input className="mt-4 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="مثال: 10737418240" value={capacityInput} onChange={(event) => setCapacityInput(event.target.value)} />
          <button disabled={busy} onClick={() => void submitCapacity()} className="mt-4 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'جارٍ الحفظ...' : 'حفظ الحد الأقصى'}</button>
        </aside>
      </section>

      <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-indigo-600">Shard Scale Policy</div>
        <h2 className="mt-1 text-xl font-bold text-slate-900">سياسات الشاردات</h2>
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {databases.map((database) => {
            const draft = policyDrafts[database.database_key] ?? draftFromOption(database);
            return (
              <div key={database.database_key} className="rounded-[28px] border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-bold text-slate-900">{database.display_name}</div>
                    <div className="text-xs text-slate-500">{database.database_key}</div>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${capacityStateClass(database.capacity_state)}`}>{capacityStateLabel(database.capacity_state)}</span>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-white p-3"><div className="text-xs text-slate-500">الحمل الحالي</div><div className="mt-1 font-bold text-slate-900">{database.total_load_units ?? 0} / {database.max_load_units ?? 0}</div></div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-3"><div className="text-xs text-slate-500">عدد القهاوي</div><div className="mt-1 font-bold text-slate-900">{database.cafe_count}{typeof database.max_cafes === 'number' ? ` / ${database.max_cafes}` : ''}</div></div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-3"><div className="text-xs text-slate-500">الثقيلة</div><div className="mt-1 font-bold text-slate-900">{database.heavy_cafe_count ?? 0}{typeof database.max_heavy_cafes === 'number' ? ` / ${database.max_heavy_cafes}` : ''}</div></div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <input className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="max load units" value={draft.maxLoadUnits} onChange={(event) => setPolicyDrafts((value) => ({ ...value, [database.database_key]: { ...draft, maxLoadUnits: event.target.value } }))} />
                  <input className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="warning %" value={draft.warningLoadPercent} onChange={(event) => setPolicyDrafts((value) => ({ ...value, [database.database_key]: { ...draft, warningLoadPercent: event.target.value } }))} />
                  <input className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="critical %" value={draft.criticalLoadPercent} onChange={(event) => setPolicyDrafts((value) => ({ ...value, [database.database_key]: { ...draft, criticalLoadPercent: event.target.value } }))} />
                  <input className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="max cafes" value={draft.maxCafes} onChange={(event) => setPolicyDrafts((value) => ({ ...value, [database.database_key]: { ...draft, maxCafes: event.target.value } }))} />
                  <input className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="max heavy cafes" value={draft.maxHeavyCafes} onChange={(event) => setPolicyDrafts((value) => ({ ...value, [database.database_key]: { ...draft, maxHeavyCafes: event.target.value } }))} />
                  <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                    <input type="checkbox" checked={draft.isAcceptingNewCafes} onChange={(event) => setPolicyDrafts((value) => ({ ...value, [database.database_key]: { ...draft, isAcceptingNewCafes: event.target.checked } }))} />
                    تستقبل قهاوي جديدة
                  </label>
                  <textarea className="min-h-24 rounded-2xl border border-slate-200 px-4 py-3 text-sm md:col-span-2" placeholder="ملاحظات التشغيل أو السياسة" value={draft.scaleNotes} onChange={(event) => setPolicyDrafts((value) => ({ ...value, [database.database_key]: { ...draft, scaleNotes: event.target.value } }))} />
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="text-xs text-slate-500">نسبة الاستخدام الحالية: {typeof database.load_percent === 'number' ? `${database.load_percent.toFixed(2)}%` : '—'}</div>
                  <button disabled={policyBusyByKey[database.database_key] === true} onClick={() => void submitPolicy(database.database_key)} className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                    {policyBusyByKey[database.database_key] === true ? 'جارٍ الحفظ...' : 'حفظ السياسة'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
