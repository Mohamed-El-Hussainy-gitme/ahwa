'use client';

import { useCallback } from 'react';
import Link, { type LinkProps } from 'next/link';
import { MobileShell } from '@/ui/MobileShell';
import { useAuthz } from '@/lib/authz';
import { AccessDenied, ShiftRequired } from '@/ui/AccessState';
import { opsClient } from '@/lib/ops/client';
import type { DashboardWorkspace } from '@/lib/ops/types';
import { useOpsWorkspace } from '@/lib/ops/hooks';
import { useOpsChrome } from '@/lib/ops/chrome';
import { QueueHealthStrip } from '@/ui/ops/QueueHealthStrip';
import { OperationalHealthPanel } from '@/ui/ops/OperationalHealthPanel';

type StatCard = {
  label: string;
  value: number;
};

type QuickLink = {
  href: LinkProps['href'];
  label: string;
};

export default function DashboardPage() {
  const { can, shift, effectiveRole } = useAuthz();
  const loader = useCallback(() => opsClient.dashboardWorkspace(), []);
  const { data, error } = useOpsWorkspace<DashboardWorkspace>(loader, { enabled: Boolean(shift) });
  const { summary, sync, lastLoadedAt } = useOpsChrome();

  if (!can.viewDashboard) {
    const fallback = effectiveRole === 'barista' ? '/kitchen' : effectiveRole === 'shisha' ? '/shisha' : '/orders';
    return <AccessDenied title="الرئيسية" backHref={fallback} message="هذه الصفحة متاحة للمعلم والمشرف فقط." />;
  }

  if (!shift) {
    return <ShiftRequired title="الرئيسية" />;
  }

  const quickLinks: QuickLink[] = [
    { href: '/orders', label: 'طلبات' },
    { href: '/kitchen', label: 'باريستا' },
    { href: '/shisha', label: 'شيشة' },
    { href: '/billing', label: 'الحساب' },
    { href: '/complaints', label: 'الشكاوى' },
    ...(can.viewShift ? [{ href: '/shift' as const, label: 'الوردية' }] : []),
    ...(can.owner ? [{ href: '/owner' as const, label: 'إدارة' }] : []),
  ];

  const cards: StatCard[] = [
    { label: 'جلسات مفتوحة', value: data?.openSessions ?? 0 },
    { label: 'انتظار الباريستا', value: data?.waitingBarista ?? 0 },
    { label: 'انتظار الشيشة', value: data?.waitingShisha ?? 0 },
    { label: 'جاهز للتسليم', value: data?.readyForDelivery ?? 0 },
    { label: 'جاهز للحساب', value: data?.billableQty ?? 0 },
    { label: 'رصيد الأجل', value: Math.round(data?.deferredOutstanding ?? 0) },
  ];

  return (
    <MobileShell title="الرئيسية">
      {error ? (
        <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <OperationalHealthPanel
        summary={summary}
        syncState={sync.state}
        lastLoadedAt={lastLoadedAt}
        className="mb-3"
      />

      <QueueHealthStrip health={summary?.queueHealth ?? data?.queueHealth ?? null} className="mb-3" />

      <div className="grid grid-cols-2 gap-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
            <div className="text-2xl font-bold text-slate-900">{card.value}</div>
            <div className="mt-1 text-sm text-slate-600">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {quickLinks.map((link) => (
          <Link key={String(link.href)} href={link.href} className="rounded-2xl bg-slate-900 px-4 py-4 text-center font-semibold text-white">
            {link.label}
          </Link>
        ))}
      </div>
    </MobileShell>
  );
}
