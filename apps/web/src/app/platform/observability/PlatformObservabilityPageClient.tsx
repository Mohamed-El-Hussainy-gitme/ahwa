'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  PlatformOperationalObservabilityRow,
  PlatformOperationalObservabilitySummary,
} from '@ahwa/shared';
import {
  extractPlatformApiErrorMessage,
  isPlatformApiOk,
} from '@/lib/platform-auth/api';

type ObservabilityState = {
  summary: PlatformOperationalObservabilitySummary | null;
  items: PlatformOperationalObservabilityRow[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asNullableNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeItem(value: unknown): PlatformOperationalObservabilityRow | null {
  if (!isRecord(value)) return null;
  const databaseKey = asString(value.database_key);
  const displayName = asString(value.display_name);
  if (!databaseKey || !displayName) return null;

  return {
    database_key: databaseKey,
    display_name: displayName,
    description: asString(value.description),
    configured_in_env: value.configured_in_env !== false,
    is_active: value.is_active !== false,
    is_accepting_new_cafes: value.is_accepting_new_cafes !== false,
    cafe_count: asNumber(value.cafe_count),
    total_load_units: asNumber(value.total_load_units),
    max_load_units: asNumber(value.max_load_units),
    load_percent: asNumber(value.load_percent),
    heavy_cafe_count: asNumber(value.heavy_cafe_count),
    max_cafes: asNullableNumber(value.max_cafes),
    max_heavy_cafes: asNullableNumber(value.max_heavy_cafes),
    capacity_state:
      value.capacity_state === 'warning' || value.capacity_state === 'critical' || value.capacity_state === 'hot' || value.capacity_state === 'full' || value.capacity_state === 'draining' || value.capacity_state === 'inactive'
        ? value.capacity_state
        : 'healthy',
    scale_notes: asString(value.scale_notes),
    status: value.status === 'critical' || value.status === 'warning' ? value.status : 'healthy',
    generated_at: asString(value.generated_at),
    database_name: asString(value.database_name),
    runtime: isRecord(value.runtime)
      ? {
          open_shift_count: asNumber(value.runtime.open_shift_count),
          active_cafe_count: asNumber(value.runtime.active_cafe_count),
          open_session_count: asNumber(value.runtime.open_session_count),
          pending_item_count: asNumber(value.runtime.pending_item_count),
          ready_item_count: asNumber(value.runtime.ready_item_count),
          waiting_qty: asNumber(value.runtime.waiting_qty),
          ready_qty: asNumber(value.runtime.ready_qty),
          billable_qty: asNumber(value.runtime.billable_qty),
          oldest_pending_seconds: asNullableNumber(value.runtime.oldest_pending_seconds),
          oldest_ready_seconds: asNullableNumber(value.runtime.oldest_ready_seconds),
          deferred_customer_count: asNumber(value.runtime.deferred_customer_count),
          deferred_outstanding_amount: asNumber(value.runtime.deferred_outstanding_amount),
          last_deferred_entry_at: asString(value.runtime.last_deferred_entry_at),
        }
      : {
          open_shift_count: 0,
          active_cafe_count: 0,
          open_session_count: 0,
          pending_item_count: 0,
          ready_item_count: 0,
          waiting_qty: 0,
          ready_qty: 0,
          billable_qty: 0,
          oldest_pending_seconds: null,
          oldest_ready_seconds: null,
          deferred_customer_count: 0,
          deferred_outstanding_amount: 0,
          last_deferred_entry_at: null,
        },
    outbox: isRecord(value.outbox)
      ? {
          pending_count: asNumber(value.outbox.pending_count),
          inflight_count: asNumber(value.outbox.inflight_count),
          retrying_count: asNumber(value.outbox.retrying_count),
          dead_letter_count: asNumber(value.outbox.dead_letter_count),
          max_publish_attempts: asNumber(value.outbox.max_publish_attempts),
          oldest_pending_seconds: asNullableNumber(value.outbox.oldest_pending_seconds),
          last_published_at: asString(value.outbox.last_published_at),
        }
      : {
          pending_count: 0,
          inflight_count: 0,
          retrying_count: 0,
          dead_letter_count: 0,
          max_publish_attempts: 0,
          oldest_pending_seconds: null,
          last_published_at: null,
        },
    dispatch: isRecord(value.dispatch)
      ? {
          last_run_at: asString(value.dispatch.last_run_at),
          last_hour_runs: asNumber(value.dispatch.last_hour_runs),
          last_hour_claimed: asNumber(value.dispatch.last_hour_claimed),
          last_hour_published: asNumber(value.dispatch.last_hour_published),
          last_hour_failed: asNumber(value.dispatch.last_hour_failed),
          last_hour_dead_lettered: asNumber(value.dispatch.last_hour_dead_lettered),
          last_hour_avg_duration_ms: asNumber(value.dispatch.last_hour_avg_duration_ms),
        }
      : {
          last_run_at: null,
          last_hour_runs: 0,
          last_hour_claimed: 0,
          last_hour_published: 0,
          last_hour_failed: 0,
          last_hour_dead_lettered: 0,
          last_hour_avg_duration_ms: 0,
        },
    alerts: Array.isArray(value.alerts)
      ? value.alerts
          .map((item) => (isRecord(item) && asString(item.code) && asString(item.message)
            ? {
                code: asString(item.code)!,
                message: asString(item.message)!,
                severity: item.severity === 'critical' || item.severity === 'warning' ? item.severity : 'healthy',
              }
            : null))
          .filter((item): item is PlatformOperationalObservabilityRow['alerts'][number] => item !== null)
      : [],
    error: asString(value.error),
  };
}

function normalizeSummary(value: unknown): PlatformOperationalObservabilitySummary | null {
  if (!isRecord(value)) return null;
  const generatedAt = asString(value.generated_at);
  if (!generatedAt) return null;
  return {
    generated_at: generatedAt,
    shard_count: asNumber(value.shard_count),
    healthy_shard_count: asNumber(value.healthy_shard_count),
    warning_shard_count: asNumber(value.warning_shard_count),
    critical_shard_count: asNumber(value.critical_shard_count),
    total_cafes: asNumber(value.total_cafes),
    total_load_units: asNumber(value.total_load_units),
    total_max_load_units: asNumber(value.total_max_load_units),
    total_active_cafes: asNumber(value.total_active_cafes),
    total_open_shifts: asNumber(value.total_open_shifts),
    total_open_sessions: asNumber(value.total_open_sessions),
    total_waiting_qty: asNumber(value.total_waiting_qty),
    total_ready_qty: asNumber(value.total_ready_qty),
    total_billable_qty: asNumber(value.total_billable_qty),
    total_outbox_pending: asNumber(value.total_outbox_pending),
    total_outbox_inflight: asNumber(value.total_outbox_inflight),
    total_dead_letters: asNumber(value.total_dead_letters),
    total_dispatch_published_last_hour: asNumber(value.total_dispatch_published_last_hour),
    total_dispatch_failed_last_hour: asNumber(value.total_dispatch_failed_last_hour),
  };
}

function toneClass(status: PlatformOperationalObservabilityRow['status']) {
  switch (status) {
    case 'critical':
      return 'border-red-200 bg-red-50 text-red-800';
    case 'warning':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    default:
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  }
}

function formatRelativeSeconds(value: number | null) {
  if (value == null) return '—';
  if (value < 60) return `${value} ثانية`;
  const minutes = Math.floor(value / 60);
  if (minutes < 60) return `${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  return `${hours} ساعة`;
}

function formatDateTime(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function MetricCard({ title, value, helper }: { title: string; value: string; helper?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs text-slate-500">{title}</div>
      <div className="mt-1 text-xl font-bold text-slate-900">{value}</div>
      {helper ? <div className="mt-1 text-xs text-slate-500">{helper}</div> : null}
    </div>
  );
}

export default function PlatformObservabilityPageClient() {
  const [state, setState] = useState<ObservabilityState>({ summary: null, items: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/platform/observability/overview', {
        cache: 'no-store',
        credentials: 'include',
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok || !isPlatformApiOk(payload)) {
        throw new Error(extractPlatformApiErrorMessage(payload, 'LOAD_PLATFORM_OBSERVABILITY_FAILED'));
      }
      const envelope: Record<string, unknown> = isRecord(payload) ? payload : {};
      const summary = normalizeSummary(envelope.summary);
      const items = Array.isArray(envelope.items)
        ? envelope.items.map(normalizeItem).filter((item: PlatformOperationalObservabilityRow | null): item is PlatformOperationalObservabilityRow => item !== null)
        : [];
      setState({ summary, items });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'LOAD_PLATFORM_OBSERVABILITY_FAILED');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = state.summary;
  const summaryCards = useMemo(() => {
    if (!summary) return [];
    return [
      { title: 'الشاردات الحرجة', value: String(summary.critical_shard_count), helper: `تحذير ${summary.warning_shard_count}` },
      { title: 'القهاوي النشطة الآن', value: String(summary.total_active_cafes), helper: `إجمالي ${summary.total_cafes}` },
      { title: 'الجلسات المفتوحة', value: String(summary.total_open_sessions), helper: `شيفتات مفتوحة ${summary.total_open_shifts}` },
      { title: 'انتظار / جاهز', value: `${summary.total_waiting_qty} / ${summary.total_ready_qty}`, helper: `قابل للحساب ${summary.total_billable_qty}` },
      { title: 'Outbox pending', value: String(summary.total_outbox_pending), helper: `inflight ${summary.total_outbox_inflight}` },
      { title: 'نشر آخر ساعة', value: String(summary.total_dispatch_published_last_hour), helper: `فشل ${summary.total_dispatch_failed_last_hour} | ميت ${summary.total_dead_letters}` },
    ];
  }, [summary]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
        >
          تحديث القراءة
        </button>
        {summary ? <div className="text-sm text-slate-500">آخر توليد: {formatDateTime(summary.generated_at)}</div> : null}
      </div>

      {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">جارٍ تحميل لوحة المراقبة...</div> : null}
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      {summaryCards.length ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {summaryCards.map((card) => (
            <MetricCard key={card.title} title={card.title} value={card.value} helper={card.helper} />
          ))}
        </section>
      ) : null}

      <section className="grid gap-4">
        {state.items.map((item) => (
          <article key={item.database_key} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">{item.database_key}</div>
                <h2 className="mt-1 text-xl font-bold text-slate-900">{item.display_name}</h2>
                <div className="mt-2 text-sm text-slate-500">{item.description ?? 'بدون وصف إضافي'}</div>
              </div>
              <div className={["rounded-full border px-3 py-1 text-sm font-semibold", toneClass(item.status)].join(' ')}>
                {item.status === 'critical' ? 'حرج' : item.status === 'warning' ? 'متابعة' : 'سليم'}
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-4">
              <MetricCard title="الحمل" value={`${item.total_load_units}/${item.max_load_units}`} helper={`%${item.load_percent.toFixed(1)}`} />
              <MetricCard title="القهاوي" value={String(item.cafe_count)} helper={`ثقيلة ${item.heavy_cafe_count}`} />
              <MetricCard title="الجلسات المفتوحة" value={String(item.runtime.open_session_count)} helper={`نشطة ${item.runtime.active_cafe_count}`} />
              <MetricCard title="Outbox" value={`${item.outbox.pending_count} pending`} helper={`inflight ${item.outbox.inflight_count} | dead ${item.outbox.dead_letter_count}`} />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <MetricCard title="انتظار / جاهز" value={`${item.runtime.waiting_qty} / ${item.runtime.ready_qty}`} helper={`billable ${item.runtime.billable_qty}`} />
              <MetricCard title="أقدم pending" value={formatRelativeSeconds(item.outbox.oldest_pending_seconds)} helper={`max attempts ${item.outbox.max_publish_attempts}`} />
              <MetricCard title="Dispatch آخر ساعة" value={String(item.dispatch.last_hour_published)} helper={`فشل ${item.dispatch.last_hour_failed} | متوسط ${item.dispatch.last_hour_avg_duration_ms.toFixed(0)}ms`} />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <div className="font-semibold text-slate-900">حالة التحديث</div>
                <div className="mt-2">snapshot: {formatDateTime(item.generated_at)}</div>
                <div className="mt-1">آخر dispatch: {formatDateTime(item.dispatch.last_run_at)}</div>
                <div className="mt-1">آخر deferred entry: {formatDateTime(item.runtime.last_deferred_entry_at)}</div>
                {item.scale_notes ? <div className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2">{item.scale_notes}</div> : null}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <div className="font-semibold text-slate-900">التنبيهات</div>
                {item.alerts.length ? (
                  <div className="mt-3 space-y-2">
                    {item.alerts.map((alert) => (
                      <div key={`${item.database_key}-${alert.code}`} className={[
                        'rounded-xl border px-3 py-2',
                        alert.severity === 'critical'
                          ? 'border-red-200 bg-red-50 text-red-700'
                          : alert.severity === 'warning'
                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-700',
                      ].join(' ')}>
                        {alert.message}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 text-emerald-700">لا توجد تنبيهات حرجة حاليًا.</div>
                )}
                {item.error ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-red-700">{item.error}</div> : null}
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
