'use client';

import type { OpsQueueHealth } from '@/lib/ops/types';

function toneForAge(minutes: number | null) {
  if (minutes == null) return 'border-slate-200 bg-slate-50 text-slate-600';
  if (minutes >= 15) return 'border-red-200 bg-red-50 text-red-700';
  if (minutes >= 8) return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

function stalledTone(count: number) {
  if (count >= 3) return 'border-red-200 bg-red-50 text-red-700';
  if (count >= 1) return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
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
      <div className={['rounded-2xl border px-3 py-3 text-sm', toneForAge(health.oldestPendingMinutes)].join(' ')}>
        <div className="text-xs font-semibold">أقدم انتظار</div>
        <div className="mt-1 text-base font-bold">{formatMinutes(health.oldestPendingMinutes)}</div>
      </div>
      <div className={['rounded-2xl border px-3 py-3 text-sm', toneForAge(health.oldestReadyMinutes)].join(' ')}>
        <div className="text-xs font-semibold">أقدم جاهز</div>
        <div className="mt-1 text-base font-bold">{formatMinutes(health.oldestReadyMinutes)}</div>
      </div>
      <div className={['rounded-2xl border px-3 py-3 text-sm', stalledTone(health.stalledSessionsCount)].join(' ')}>
        <div className="text-xs font-semibold">جلسات متوقفة</div>
        <div className="mt-1 text-base font-bold">{health.stalledSessionsCount}</div>
        <div className="mt-1 text-[11px] opacity-80">بعد {health.stalledThresholdMinutes} دقيقة بلا نشاط</div>
      </div>
    </div>
  );
}
