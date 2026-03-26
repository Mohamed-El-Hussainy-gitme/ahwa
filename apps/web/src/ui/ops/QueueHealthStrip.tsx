'use client';

import type { OpsQueueHealth } from '@/lib/ops/types';
import { opsMetricCard } from '@/ui/ops/premiumStyles';

function toneForAge(minutes: number | null): 'neutral' | 'warning' | 'danger' | 'success' {
  if (minutes == null) return 'neutral';
  if (minutes >= 15) return 'danger';
  if (minutes >= 8) return 'warning';
  return 'success';
}

function stalledTone(count: number): 'neutral' | 'warning' | 'danger' {
  if (count >= 3) return 'danger';
  if (count >= 1) return 'warning';
  return 'neutral';
}

function formatMinutes(minutes: number | null) {
  if (minutes == null) return '—';
  if (minutes < 60) return `${minutes} د`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}س ${rest}د` : `${hours}س`;
}

export function QueueHealthStrip({
  health,
  className = '',
}: {
  health: OpsQueueHealth | null | undefined;
  className?: string;
}) {
  if (!health) return null;

  const hasSignal =
    health.oldestPendingMinutes != null ||
    health.oldestReadyMinutes != null ||
    health.stalledSessionsCount > 0;

  if (!hasSignal) return null;

  return (
    <div className={['grid grid-cols-1 gap-2 sm:grid-cols-3', className].join(' ')}>
      <div className={opsMetricCard(toneForAge(health.oldestPendingMinutes))}>
        <div className="text-xs font-semibold opacity-80">أقدم انتظار</div>
        <div className="mt-1 text-base font-black">{formatMinutes(health.oldestPendingMinutes)}</div>
      </div>
      <div className={opsMetricCard(toneForAge(health.oldestReadyMinutes))}>
        <div className="text-xs font-semibold opacity-80">أقدم جاهز</div>
        <div className="mt-1 text-base font-black">{formatMinutes(health.oldestReadyMinutes)}</div>
      </div>
      <div className={opsMetricCard(stalledTone(health.stalledSessionsCount))}>
        <div className="text-xs font-semibold opacity-80">جلسات متوقفة</div>
        <div className="mt-1 text-base font-black">{health.stalledSessionsCount}</div>
        <div className="mt-1 text-[11px] opacity-75">الحد المتابع {health.stalledThresholdMinutes} دقيقة</div>
      </div>
    </div>
  );
}
