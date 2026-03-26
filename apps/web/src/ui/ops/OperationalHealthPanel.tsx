'use client';

import type { OpsNavSummary } from '@/lib/ops/types';
import { opsMetricCard } from '@/ui/ops/premiumStyles';

type SyncState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

type MetricTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

function syncLabel(state: SyncState) {
  switch (state) {
    case 'connected':
      return 'مباشر';
    case 'connecting':
    case 'reconnecting':
      return 'يعيد الاتصال';
    case 'disconnected':
      return 'غير متصل';
    default:
      return 'قيد المتابعة';
  }
}

function syncTone(state: SyncState): MetricTone {
  switch (state) {
    case 'connected':
      return 'success';
    case 'connecting':
    case 'reconnecting':
      return 'warning';
    case 'disconnected':
      return 'danger';
    default:
      return 'neutral';
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
      ? 'danger'
      : readyMinutes != null && readyMinutes >= 8
        ? 'warning'
        : summary.readyForDelivery > 0
          ? 'info'
          : 'success';

  const sessionTone: MetricTone = stalledCount >= 2 ? 'danger' : stalledCount >= 1 ? 'warning' : 'info';
  const billingTone: MetricTone =
    summary.billableQty >= 12 || summary.deferredCustomerCount >= 6
      ? 'danger'
      : summary.billableQty > 0 || summary.deferredCustomerCount > 0
        ? 'warning'
        : 'success';

  return (
    <div className={['grid grid-cols-1 gap-2 sm:grid-cols-2', className].join(' ')}>
      <div className={opsMetricCard(syncTone(syncState))}>
        <div className="text-xs font-semibold opacity-80">حالة النظام</div>
        <div className="mt-1 text-base font-black">{syncLabel(syncState)}</div>
        <div className="mt-1 text-[11px] opacity-75">{formatSyncAge(lastLoadedAt)}</div>
      </div>

      <div className={opsMetricCard(deliveryTone)}>
        <div className="text-xs font-semibold opacity-80">التسليم والانتظار</div>
        <div className="mt-1 text-base font-black">{summary.readyForDelivery} جاهز</div>
        <div className="mt-1 text-[11px] opacity-75">أقدم جاهز: {formatMinutes(readyMinutes)}</div>
      </div>

      <div className={opsMetricCard(sessionTone)}>
        <div className="text-xs font-semibold opacity-80">الجلسات</div>
        <div className="mt-1 text-base font-black">{summary.openSessions} مفتوحة</div>
        <div className="mt-1 text-[11px] opacity-75">جلسات متوقفة: {stalledCount}</div>
      </div>

      <div className={opsMetricCard(billingTone)}>
        <div className="text-xs font-semibold opacity-80">الحساب والآجل</div>
        <div className="mt-1 text-base font-black">{summary.billableQty} للحساب</div>
        <div className="mt-1 text-[11px] opacity-75">أسماء آجل نشطة: {summary.deferredCustomerCount}</div>
      </div>
    </div>
  );
}
