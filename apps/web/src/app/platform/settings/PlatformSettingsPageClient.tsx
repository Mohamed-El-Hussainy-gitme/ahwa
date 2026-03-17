'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  extractPlatformApiErrorMessage,
  isPlatformApiOk,
  type PlatformApiEnvelope,
} from '@/lib/platform-auth/api';

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

function isDatabaseCapacityResponse(value: unknown): value is DatabaseCapacityResponse {
  return isRecord(value) && value.ok === true && (value.data === null || isDatabaseCapacityData(value.data));
}

export default function PlatformSettingsPageClient() {
  const [data, setData] = useState<DatabaseCapacityData | null>(null);
  const [capacityInput, setCapacityInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/platform/overview', {
        cache: 'no-store',
        credentials: 'include',
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok || !isPlatformApiOk(payload)) {
        throw new Error(extractPlatformApiErrorMessage(payload, 'LOAD_DATABASE_CAPACITY_FAILED'));
      }

      const envelope = payload as PlatformApiEnvelope<Record<string, unknown> | null>;
      const overviewData = isRecord(envelope.data) ? envelope.data.database_usage : null;
      if (isDatabaseCapacityData(overviewData)) {
        setData(overviewData);
        setCapacityInput(typeof overviewData.capacity_bytes === 'number' ? String(overviewData.capacity_bytes) : '');
      } else {
        setData(null);
        setCapacityInput('');
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'LOAD_DATABASE_CAPACITY_FAILED');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const usageWidth = useMemo(() => {
    const percent = typeof data?.usage_percent === 'number' ? Math.max(0, Math.min(100, data.usage_percent)) : 0;
    return `${percent}%`;
  }, [data?.usage_percent]);

  async function submit() {
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
      setSuccess('تم تحديث حد السعة بنجاح.');
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'SAVE_DATABASE_CAPACITY_FAILED');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-indigo-600">Database Capacity</div>
            <h2 className="mt-1 text-xl font-bold text-slate-900">سعة قاعدة البيانات</h2>
          </div>
          <button type="button" onClick={() => void load()} className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700">
            تحديث القراءة
          </button>
        </div>

        {loading ? <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">جارٍ تحميل بيانات السعة...</div> : null}
        {error ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{success}</div> : null}

        {data ? (
          <div className="mt-5 space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-500">المستخدم حاليًا</div>
                <div className="mt-1 text-lg font-bold text-slate-900">{data.used_pretty}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-500">الحد الأقصى</div>
                <div className="mt-1 text-lg font-bold text-slate-900">{data.capacity_pretty ?? 'غير محدد'}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-500">قاعدة البيانات</div>
                <div className="mt-1 text-lg font-bold text-slate-900">{data.database_name}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-slate-700">نسبة الاستخدام</span>
                <span className="font-semibold text-slate-900">{typeof data.usage_percent === 'number' ? `${data.usage_percent.toFixed(2)}%` : 'غير محسوبة'}</span>
              </div>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-indigo-600" style={{ width: usageWidth }} />
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <aside className="space-y-6">
        <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-indigo-600">Capacity Limit</div>
          <h2 className="mt-1 text-lg font-bold text-slate-900">تحديث الحد الأقصى</h2>
          <p className="mt-2 text-sm text-slate-500">أدخل القيمة بالبايت. اترك الحقل فارغًا لإزالة الحد الحالي.</p>
          <input
            className="mt-4 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
            placeholder="مثال: 10737418240"
            value={capacityInput}
            onChange={(event) => setCapacityInput(event.target.value)}
          />
          <button disabled={busy} onClick={() => void submit()} className="mt-4 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? 'جارٍ الحفظ...' : 'حفظ الحد الأقصى'}
          </button>
        </section>
      </aside>
    </div>
  );
}
