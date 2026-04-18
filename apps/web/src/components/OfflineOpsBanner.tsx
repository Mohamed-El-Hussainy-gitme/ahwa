'use client';

import { useMemo } from 'react';
import { useOpsPwa } from '@/lib/pwa/provider';

function formatClockTime(value: number | null) {
  if (!value) return null;
  return new Date(value).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

export default function OfflineOpsBanner() {
  const { isOnline, queueSize, syncing, lastSyncAt, lastError, nextRetryAt, flushQueue } = useOpsPwa();

  const state = useMemo(() => {
    if (!isOnline) {
      return {
        tone: 'border-amber-300 bg-amber-50 text-amber-900',
        title: 'أنت تعمل الآن بدون اتصال',
        body: queueSize > 0
          ? `هناك ${queueSize} عملية إدارية محفوظة محليًا وستُرسل عند عودة الشبكة. مسارات البيع الحي غير مدعومة أوفلاين.`
          : 'سيتم حفظ drafts الإدارة محليًا. مسارات البيع الحي والجلسات المباشرة تبقى خارج وضع الأوفلاين.',
      };
    }
    if (syncing) {
      return {
        tone: 'border-sky-300 bg-sky-50 text-sky-900',
        title: 'جارٍ مزامنة العمليات الإدارية',
        body: queueSize > 0 ? `يتم الآن إرسال ${queueSize} عملية مؤجلة إلى الخادم.` : 'يتم إنهاء المزامنة المحلية.',
      };
    }
    if (queueSize > 0 && nextRetryAt) {
      return {
        tone: 'border-indigo-300 bg-indigo-50 text-indigo-900',
        title: 'الطابور الإداري ينتظر إعادة المحاولة',
        body: `هناك ${queueSize} عملية مؤجلة. ستتم إعادة المحاولة تلقائيًا، ويمكنك إجبار المزامنة الآن.`,
      };
    }
    if (queueSize > 0) {
      return {
        tone: 'border-indigo-300 bg-indigo-50 text-indigo-900',
        title: 'هناك عمليات إدارية مؤجلة',
        body: `بقي ${queueSize} طلب ${queueSize === 1 ? 'واحد' : 'إداري'} في الطابور المحلي. يمكنك إعادة المحاولة الآن.`,
      };
    }
    if (lastError && lastError !== 'OFFLINE') {
      return {
        tone: 'border-rose-300 bg-rose-50 text-rose-900',
        title: 'بعض العمليات المؤجلة لم تُكمل',
        body: `آخر رسالة من الطابور: ${lastError}`,
      };
    }
    return null;
  }, [isOnline, lastError, nextRetryAt, queueSize, syncing]);

  if (!state) return null;

  const syncLabel = formatClockTime(lastSyncAt);
  const retryLabel = formatClockTime(nextRetryAt);

  return (
    <div className={`sticky top-0 z-50 border-b px-3 py-2 text-sm ${state.tone}`} dir="rtl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">{state.title}</div>
          <div className="text-xs opacity-90">
            {state.body}
            {retryLabel ? ` • إعادة المحاولة ${retryLabel}` : ''}
            {syncLabel ? ` • آخر مزامنة ${syncLabel}` : ''}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {queueSize > 0 || syncing ? (
            <span className="rounded-full border border-current/25 px-2 py-1 text-[11px] font-semibold">
              الطابور: {queueSize}
            </span>
          ) : null}
          {isOnline && queueSize > 0 && !syncing ? (
            <button type="button" onClick={() => void flushQueue()} className="rounded-full border border-current/30 px-3 py-1 text-xs font-semibold">
              مزامنة الآن
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
