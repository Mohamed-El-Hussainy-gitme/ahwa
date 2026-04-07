'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useOpsWorkspace } from '@/lib/ops/hooks';
import { opsClient } from '@/lib/ops/client';
import { useSession } from '@/lib/session';
import type { OwnerOnboardingGuide } from '@/lib/ops/types';

function stepHref(stepKey: OwnerOnboardingGuide['steps'][number]['key']) {
  switch (stepKey) {
    case 'menu':
      return '/menu';
    case 'staff':
      return '/staff';
    case 'shift':
    case 'roles':
      return '/shift';
    default:
      return '/owner';
  }
}

function storageKey(cafeId: string | undefined) {
  return cafeId ? `ahwa.owner-guide.${cafeId}` : 'ahwa.owner-guide';
}

export function OwnerOnboardingGuideCard() {
  const session = useSession();
  const loader = useCallback(() => opsClient.ownerOnboardingGuide(), []);
  const { data, error, loading, reload } = useOpsWorkspace<OwnerOnboardingGuide>(loader, {
    shouldReloadOnEvent: () => true,
  });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === 'hidden') return;
      void reload();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [reload]);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey(session.user?.cafeId)) : null;
    setDismissed(saved === '1');
  }, [session.user?.cafeId]);

  const setDismissedState = useCallback((next: boolean) => {
    setDismissed(next);
    if (typeof window === 'undefined') return;
    const key = storageKey(session.user?.cafeId);
    if (next) window.localStorage.setItem(key, '1');
    else window.localStorage.removeItem(key);
  }, [session.user?.cafeId]);

  if (error) return null;
  if (loading && !data) {
    return (
      <section className="mb-3 ahwa-card p-4">
        <div className="h-4 w-40 animate-pulse rounded bg-neutral-200" />
        <div className="mt-3 h-20 animate-pulse rounded-2xl bg-[#efe5d8]" />
      </section>
    );
  }
  if (!data) return null;

  const incompleteSteps = data.steps.filter((step) => !step.done);
  const nextStep = incompleteSteps[0] ?? null;

  if (dismissed) {
    return (
      <section className="mb-3 ahwa-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-[#1e1712]">خارطة التشغيل الأولى</div>
            <div className="mt-1 text-xs text-[#8a7763]">{data.readyToRun ? 'اكتملت الخارطة ويمكنك إظهارها عند الحاجة.' : `تم إخفاء الخارطة مؤقتًا. المتبقي ${data.totalCount - data.completedCount} خطوة.`}</div>
          </div>
          <button type="button" onClick={() => setDismissedState(false)} className="ahwa-btn-secondary px-3 py-2 text-xs">إظهار الخارطة</button>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-3 ahwa-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-[#1e1712]">خارطة التشغيل الأولى</div>
          <div className="mt-1 text-xs text-[#8a7763]">{data.completedCount}/{data.totalCount} مكتملة • {data.completionPercent}%</div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void reload()} className="ahwa-btn-secondary px-3 py-2 text-xs">تحديث</button>
          <button type="button" onClick={() => setDismissedState(true)} className="ahwa-btn-secondary px-3 py-2 text-xs">إخفاء الآن</button>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#efe5d8]"><div className="h-full rounded-full bg-[#9b6b2e] transition-all" style={{ width: `${Math.max(6, data.completionPercent)}%` }} /></div>
      <div className="mt-3 rounded-2xl border border-[#d6dee5] bg-[#f4f7f9] p-3 text-sm text-[#294c63]">{data.intro}</div>
      {data.readyToRun ? (
        <div className="mt-3 rounded-2xl border border-[#cfe0d7] bg-[#eff7f1] p-3 text-sm text-[#275944]">القهوة جاهزة للتشغيل. يمكنك فتح الوردية والبدء مباشرة، ثم متابعة الآجل والتقارير من مساحة الإدارة.</div>
      ) : nextStep ? (
        <div className="mt-3 rounded-2xl border border-[#ecd9bd] bg-[#fcf3e7] p-3">
          <div className="text-sm font-semibold text-[#774c10]">الخطوة التالية</div>
          <div className="mt-1 text-sm text-[#8a5a18]">{nextStep.title}</div>
          <div className="mt-1 text-xs text-[#8a5a18]">{nextStep.description}</div>
          <div className="mt-3"><Link href={stepHref(nextStep.key)} className="ahwa-btn-secondary px-3 py-2 text-xs">فتح الخطوة</Link></div>
        </div>
      ) : null}
      <div className="mt-3 space-y-2">{data.steps.map((step) => (
        <Link key={step.key} href={stepHref(step.key)} className={[ 'flex items-start justify-between gap-3 rounded-2xl border px-3 py-3 text-right', step.done ? 'border-[#cfe0d7] bg-[#eff7f1]' : 'border-[#ecd9bd] bg-[#fcf3e7]', ].join(' ')}>
          <div>
            <div className={[ 'text-sm font-semibold', step.done ? 'text-[#275944]' : 'text-[#774c10]', ].join(' ')}>{step.title}</div>
            <div className={[ 'mt-1 text-xs', step.done ? 'text-[#2e6a4e]' : 'text-[#8a5a18]', ].join(' ')}>{step.description}</div>
          </div>
          <div className={[ 'rounded-full border bg-[#fffdf9] px-2 py-1 text-[11px] font-semibold', step.done ? 'border-[#cfe0d7] text-[#2e6a4e]' : 'border-[#ecd9bd] text-[#8a5a18]', ].join(' ')}>{step.done ? 'مكتمل' : 'غير مكتمل'}</div>
        </Link>
      ))}</div>
    </section>
  );
}
