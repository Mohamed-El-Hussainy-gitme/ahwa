'use client';

import Link from 'next/link';
import { useCallback } from 'react';
import { useOpsWorkspace } from '@/lib/ops/hooks';
import { opsClient } from '@/lib/ops/client';
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

export function OwnerOnboardingGuideCard() {
  const loader = useCallback(() => opsClient.ownerOnboardingGuide(), []);
  const { data, error, loading, reload } = useOpsWorkspace<OwnerOnboardingGuide>(loader, {
    shouldReloadOnEvent: () => false,
  });

  if (error) {
    return null;
  }

  if (loading && !data) {
    return (
      <section className="mb-3 rounded-3xl border bg-white p-4 shadow-sm">
        <div className="h-4 w-40 animate-pulse rounded bg-neutral-200" />
        <div className="mt-3 h-20 animate-pulse rounded-2xl bg-neutral-100" />
      </section>
    );
  }

  if (!data) {
    return null;
  }

  const incompleteSteps = data.steps.filter((step) => !step.done);

  return (
    <section className="mb-3 rounded-3xl border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-neutral-900">دليل البداية السريع</div>
          <div className="mt-1 text-xs text-neutral-500">{data.completedCount}/{data.totalCount} مكتملة</div>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          className="rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-neutral-700"
        >
          تحديث
        </button>
      </div>

      <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
        {data.intro}
      </div>

      {data.readyToRun ? (
        <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          القهوة جاهزة للتشغيل. يمكنك فتح الوردية والبدء فورًا، ثم متابعة الآجل والتقارير من صفحات الإدارة.
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {incompleteSteps.map((step) => (
            <Link
              key={step.key}
              href={stepHref(step.key)}
              className="flex items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-right"
            >
              <div>
                <div className="text-sm font-semibold text-amber-900">{step.title}</div>
                <div className="mt-1 text-xs text-amber-800">{step.description}</div>
              </div>
              <div className="rounded-full border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-800">غير مكتمل</div>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-neutral-600 md:grid-cols-4">
        {data.steps.map((step) => (
          <div
            key={step.key}
            className={[
              'rounded-2xl border px-3 py-2',
              step.done ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-neutral-200 bg-neutral-50',
            ].join(' ')}
          >
            <div className="font-semibold">{step.shortLabel}</div>
            <div className="mt-1 text-[11px]">{step.done ? 'تم' : 'بانتظار التنفيذ'}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
