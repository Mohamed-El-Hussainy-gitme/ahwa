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
      <section className="mb-3 rounded-3xl border bg-white p-4 shadow-sm">
        <div className="h-4 w-40 animate-pulse rounded bg-neutral-200" />
        <div className="mt-3 h-20 animate-pulse rounded-2xl bg-neutral-100" />
      </section>
    );
  }
  if (!data) return null;

  const incompleteSteps = data.steps.filter((step) => !step.done);
  const nextStep = incompleteSteps[0] ?? null;

  if (dismissed) {
    return (
      <section className="mb-3 rounded-3xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-neutral-900">دليل البداية السريع</div>
            <div className="mt-1 text-xs text-neutral-500">{data.readyToRun ? 'اكتمل الدليل ويمكنك إظهاره عند الحاجة.' : `تم إخفاء الدليل مؤقتًا. المتبقي ${data.totalCount - data.completedCount} خطوة.`}</div>
          </div>
          <button type="button" onClick={() => setDismissedState(false)} className="rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-neutral-700">إظهار الدليل</button>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-3 rounded-3xl border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-neutral-900">دليل البداية السريع</div>
          <div className="mt-1 text-xs text-neutral-500">{data.completedCount}/{data.totalCount} مكتملة • {data.completionPercent}%</div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void reload()} className="rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-neutral-700">تحديث</button>
          <button type="button" onClick={() => setDismissedState(true)} className="rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-neutral-700">تخطي الآن</button>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full bg-neutral-900 transition-all" style={{ width: `${Math.max(6, data.completionPercent)}%` }} /></div>
      <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">{data.intro}</div>
      {data.readyToRun ? (
        <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">القهوة جاهزة للتشغيل. يمكنك فتح الوردية والبدء فورًا، ثم متابعة الآجل والتقارير من صفحات الإدارة.</div>
      ) : nextStep ? (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <div className="text-sm font-semibold text-amber-900">الخطوة التالية المقترحة</div>
          <div className="mt-1 text-sm text-amber-800">{nextStep.title}</div>
          <div className="mt-1 text-xs text-amber-800">{nextStep.description}</div>
          <div className="mt-3"><Link href={stepHref(nextStep.key)} className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900">افتح الخطوة</Link></div>
        </div>
      ) : null}
      <div className="mt-3 space-y-2">{data.steps.map((step) => (
        <Link key={step.key} href={stepHref(step.key)} className={[ 'flex items-start justify-between gap-3 rounded-2xl border px-3 py-3 text-right', step.done ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50', ].join(' ')}>
          <div>
            <div className={[ 'text-sm font-semibold', step.done ? 'text-emerald-900' : 'text-amber-900', ].join(' ')}>{step.title}</div>
            <div className={[ 'mt-1 text-xs', step.done ? 'text-emerald-800' : 'text-amber-800', ].join(' ')}>{step.description}</div>
          </div>
          <div className={[ 'rounded-full border bg-white px-2 py-1 text-[11px] font-semibold', step.done ? 'border-emerald-300 text-emerald-800' : 'border-amber-300 text-amber-800', ].join(' ')}>{step.done ? 'مكتمل' : 'غير مكتمل'}</div>
        </Link>
      ))}</div>
    </section>
  );
}
