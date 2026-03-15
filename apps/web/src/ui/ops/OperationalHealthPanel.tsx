'use client';

import type { OpsNavSummary } from '@/lib/ops/types';

type SyncState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

type MetricTone = 'healthy' | 'watch' | 'alert';

function metricToneClass(tone: MetricTone) {
  switch (tone) {
    case 'alert':
      return 'border-red-200 bg-red-50 text-red-700';
    case 'watch':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    default:
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
}

function syncLabel(state: SyncState) {
  switch (state) {
    case 'connected':
      return 'مباشر';
    case 'connecting':
    case 'reconnecting':
      return 'إعادة اتصال';
    case 'disconnected':
      return 'غير متصل';
    default:
      return 'قيد المتابعة';
  }
}

function syncTone(state: SyncState): MetricTone {
  switch (state) {
    case 'connected':
      return 'healthy';
    case 'connecting':
    case 'reconnecting':
      return 'watch';
    case 'disconnected':
      return 'alert';
    default:
      return 'watch';
  }
}

function formatSyncAge(lastLoadedAt: number | null) {
  if (!lastLoadedAt) return 'لا توجد مزامنة بعد';
  const delta = Math.max(0, Math.round((Date.now() - lastLoadedAt) / 1000));
  if (delta < 60) return `آخر مزامنة منذ ${delta} ث`;
  const minutes = Math.floor(delta / 60);
  if (minutes < 60) return `آخر مزامنة منذ ${minutes} د`;
  const hours = Math.floor(minutes / 60);
  return `آخر مزامنة منذ ${hours} س`;
}

function formatMinutes(minutes: number | null) {
  if (minutes == null) return '—';
  if (minutes < 60) return `${minutes} د`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}س ${rest}د` : `${hours}س`;
}

export function OperationalHealthPanel({
  summary,
  syncState,
  lastLoadedAt,
  className = '',
}: {
  summary: OpsNavSummary | null;
  syncState: SyncState;
  lastLoadedAt: number | null;
  className?: string;
}) {
  if (!summary) return null;

  const readyMinutes = summary.queueHealth.oldestReadyMinutes;
  const stalledCount = summary.queueHealth.stalledSessionsCount;

  const deliveryTone: MetricTone =
    readyMinutes != null && readyMinutes >= 15
      ? 'alert'
      : readyMinutes != null && readyMinutes >= 8
        ? 'watch'
        : summary.readyForDelivery > 0
          ? 'watch'
          : 'healthy';

  const sessionTone: MetricTone = stalledCount >= 2 ? 'alert' : stalledCount >= 1 ? 'watch' : 'healthy';
  const billingTone: MetricTone =
    summary.billableQty >= 12 || summary.deferredCustomerCount >= 6
      ? 'alert'
      : summary.billableQty > 0 || summary.deferredCustomerCount > 0
        ? 'watch'
        : 'healthy';

  return (
    <div className={['grid grid-cols-1 gap-2 sm:grid-cols-2', className].join(' ')}>
      <div className={['rounded-2xl border px-3 py-3 text-sm', metricToneClass(syncTone(syncState))].join(' ')}>
        <div className="text-xs font-semibold">حالة النظام</div>
        <div className="mt-1 text-base font-bold">{syncLabel(syncState)}</div>
        <div className="mt-1 text-[11px] opacity-80">{formatSyncAge(lastLoadedAt)}</div>
      </div>

      <div className={['rounded-2xl border px-3 py-3 text-sm', metricToneClass(deliveryTone)].join(' ')}>
        <div className="text-xs font-semibold">التسليم والانتظار</div>
        <div className="mt-1 text-base font-bold">{summary.readyForDelivery} جاهز</div>
        <div className="mt-1 text-[11px] opacity-80">أقدم جاهز: {formatMinutes(readyMinutes)}</div>
      </div>

      <div className={['rounded-2xl border px-3 py-3 text-sm', metricToneClass(sessionTone)].join(' ')}>
        <div className="text-xs font-semibold">الجلسات</div>
        <div className="mt-1 text-base font-bold">{summary.openSessions} مفتوحة</div>
        <div className="mt-1 text-[11px] opacity-80">متوقفة: {stalledCount}</div>
      </div>

      <div className={['rounded-2xl border px-3 py-3 text-sm', metricToneClass(billingTone)].join(' ')}>
        <div className="text-xs font-semibold">الحساب والآجل</div>
        <div className="mt-1 text-base font-bold">{summary.billableQty} للحساب</div>
        <div className="mt-1 text-[11px] opacity-80">عملاء آجل: {summary.deferredCustomerCount}</div>
      </div>
    </div>
  );
}
