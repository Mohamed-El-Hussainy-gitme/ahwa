'use client';

import { useCallback } from 'react';
import Link, { type LinkProps } from 'next/link';
import { MobileShell } from '@/ui/MobileShell';
import { useAuthz } from '@/lib/authz';
import { opsClient } from '@/lib/ops/client';
import type { DashboardWorkspace } from '@/lib/ops/types';
import { useOpsWorkspace } from '@/lib/ops/hooks';
import { useOpsChrome } from '@/lib/ops/chrome';

type StatCard = {
  label: string;
  value: number | string;
  hint?: string;
  tone?: 'neutral' | 'emerald' | 'amber' | 'sky';
};

type ActionCard = {
  href: LinkProps['href'];
  label: string;
  description: string;
  tone?: 'primary' | 'secondary' | 'support';
};

type RoleView = 'owner' | 'supervisor' | 'waiter' | 'barista' | 'shisha' | 'unassigned';

function DashboardActionGrid({ actions }: { actions: ActionCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {actions.map((action) => {
        const tone =
          action.tone === 'primary'
            ? 'border-slate-900 bg-slate-900 text-white'
            : action.tone === 'support'
              ? 'border-indigo-200 bg-indigo-50 text-indigo-900'
              : 'border-slate-200 bg-white text-slate-900';

        return (
          <Link key={`${String(action.href)}-${action.label}`} href={action.href} className={`rounded-3xl border p-4 text-right shadow-sm transition hover:-translate-y-0.5 ${tone}`}>
            <div className="text-base font-bold">{action.label}</div>
            <div className={`mt-2 text-sm ${action.tone === 'primary' ? 'text-white/80' : action.tone === 'support' ? 'text-indigo-900/80' : 'text-slate-600'}`}>
              {action.description}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function DashboardStatGrid({ cards }: { cards: StatCard[] }) {
  if (!cards.length) return null;

  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((card) => {
        const tone =
          card.tone === 'emerald'
            ? 'border-emerald-200 bg-emerald-50'
            : card.tone === 'amber'
              ? 'border-amber-200 bg-amber-50'
              : card.tone === 'sky'
                ? 'border-sky-200 bg-sky-50'
                : 'border-slate-200 bg-slate-50';

        return (
          <div key={card.label} className={`rounded-3xl border p-4 text-right ${tone}`}>
            <div className="text-2xl font-bold text-slate-900">{card.value}</div>
            <div className="mt-1 text-sm text-slate-700">{card.label}</div>
            {card.hint ? <div className="mt-2 text-xs text-slate-500">{card.hint}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

function buildRoleConfig(role: RoleView, data: DashboardWorkspace | undefined, deferredCustomerCount = 0): { title: string; cards: StatCard[]; actions: ActionCard[] } {
  const stalledSessions = data?.queueHealth.stalledSessionsCount ?? 0;
  const deferredOutstanding = Math.round(data?.deferredOutstanding ?? 0);

  if (role === 'owner') {
    return {
      title: 'المعلم',
      cards: [
        { label: 'جاهز للحساب', value: data?.billableQty ?? 0, tone: 'emerald' },
        { label: 'جلسات متأخرة', value: stalledSessions, tone: stalledSessions > 0 ? 'amber' : 'neutral' },
        { label: 'عملاء آجل', value: deferredCustomerCount, hint: `رصيد ${deferredOutstanding} ج`, tone: deferredCustomerCount > 0 ? 'amber' : 'neutral' },
      ],
      actions: [
        { href: '/shift', label: 'الوردية', description: 'فتح، تقفيل، وتوزيع الأدوار.', tone: 'primary' },
        { href: '/orders', label: 'الطلبات', description: 'الجلسات، التسليم، والمتابعة المباشرة.' },
        { href: '/billing', label: 'الحساب', description: 'تحصيل المحدد أو ترحيله للآجل.' },
        { href: '/complaints', label: 'الشكاوى', description: 'مراجعة المعالجات والإعادة.' },
        { href: '/owner', label: 'إدارة القهوة', description: 'الموظفون، المنيو، والتقارير.' },
        { href: '/support?source=in_app&page=/dashboard', label: 'الدعم', description: 'مشكلة تشغيل أو دخول دعم مؤقت.', tone: 'support' },
      ],
    };
  }

  if (role === 'supervisor') {
    return {
      title: 'المشرف',
      cards: [
        { label: 'جاهز للحساب', value: data?.billableQty ?? 0, tone: 'emerald' },
        { label: 'جلسات متأخرة', value: stalledSessions, tone: stalledSessions > 0 ? 'amber' : 'neutral' },
        { label: 'أسماء آجل', value: deferredCustomerCount, tone: deferredCustomerCount > 0 ? 'amber' : 'neutral' },
      ],
      actions: [
        { href: '/orders', label: 'الطلبات', description: 'الجلسات والمنيو وإرسال الطلبات.', tone: 'primary' },
        { href: '/ready', label: 'جاهز', description: 'راجع الجاهز للتسليم وسلمه مباشرة.' },
        { href: '/billing', label: 'الحساب', description: 'تحصيل أو ترحيل إلى الآجل.' },
        { href: '/customers', label: 'دفتر الآجل', description: 'مراجعة الرصيد والسداد.' },
        { href: '/complaints', label: 'الشكاوى', description: 'تسجيل الشكوى وتنفيذ المعالجة.' },
        { href: '/support?source=in_app&page=/dashboard', label: 'الدعم', description: 'بلاغ تشغيل أو مشكلة مباشرة.', tone: 'support' },
      ],
    };
  }

  if (role === 'barista') {
    return {
      title: 'الباريستا',
      cards: [
        { label: 'جلسات مفتوحة', value: data?.openSessions ?? 0, tone: 'sky' },
        { label: 'جلسات متأخرة', value: stalledSessions, tone: stalledSessions > 0 ? 'amber' : 'neutral' },
      ],
      actions: [
        { href: '/kitchen#queue-panel', label: 'طابور الباريستا', description: 'راجع الانتظار وعلّم الجاهز.', tone: 'primary' },
        { href: '/support?source=in_app&page=/dashboard', label: 'الدعم', description: 'عطل أو مشكلة تشغيل.', tone: 'support' },
      ],
    };
  }

  if (role === 'shisha') {
    return {
      title: 'الشيشة',
      cards: [
        { label: 'جلسات مفتوحة', value: data?.openSessions ?? 0, tone: 'sky' },
        { label: 'جلسات متأخرة', value: stalledSessions, tone: stalledSessions > 0 ? 'amber' : 'neutral' },
      ],
      actions: [
        { href: '/shisha#queue-panel', label: 'طلبات الشيشة', description: 'راجع الانتظار وجهز الطلبات.', tone: 'primary' },
        { href: '/support?source=in_app&page=/dashboard', label: 'الدعم', description: 'عطل أو مشكلة تشغيل.', tone: 'support' },
      ],
    };
  }

  if (role === 'waiter') {
    return {
      title: 'الويتر',
      cards: [
        { label: 'جاهز للحساب', value: data?.billableQty ?? 0, tone: 'emerald' },
        { label: 'جلسات مفتوحة', value: data?.openSessions ?? 0, tone: 'sky' },
      ],
      actions: [
        { href: '/orders', label: 'الطلبات', description: 'الجلسات، المنيو، وإرسال الطلبات.', tone: 'primary' },
        { href: '/ready', label: 'جاهز', description: 'راجع الجاهز للتسليم وسلمه للزبون.' },
        { href: '/support?source=in_app&page=/dashboard', label: 'الدعم', description: 'طلب مساعدة أو بلاغ تشغيل.', tone: 'support' },
      ],
    };
  }

  return {
    title: 'التشغيل',
    cards: [],
    actions: [{ href: '/support?source=in_app&page=/dashboard', label: 'الدعم', description: 'أرسل الملاحظة أو المشكلة من هنا.', tone: 'support' }],
  };
}

export default function DashboardPage() {
  const { can, shift, effectiveRole } = useAuthz();
  const loader = useCallback(() => opsClient.dashboardWorkspace(), []);
  const { data, error } = useOpsWorkspace<DashboardWorkspace>(loader, { enabled: Boolean(shift) });
  const { summary } = useOpsChrome();

  const role: RoleView = can.owner ? 'owner' : effectiveRole ?? 'unassigned';
  const config = buildRoleConfig(role, data ?? undefined, summary?.deferredCustomerCount ?? 0);

  const effectiveError = error ?? null;

  if (!shift) {
    return (
      <MobileShell title="الرئيسية" topRight={<Link href="/support?source=in_app&page=/dashboard" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">دعم</Link>}>
        <div className="mb-3 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-right text-sm text-amber-950">
          {can.owner
            ? 'لا توجد وردية مفتوحة الآن. افتح وردية ثم ارجع للمتابعة.'
            : 'لا توجد وردية مفتوحة أو لم يتم تعيينك داخل وردية نشطة.'}
        </div>
        <DashboardActionGrid
          actions={can.owner ? [
            { href: '/shift', label: 'فتح وردية', description: 'حدد المشرف وباقي الفريق ثم افتح الوردية.', tone: 'primary' },
            { href: '/owner', label: 'إدارة القهوة', description: 'راجع المنيو والموظفين قبل التشغيل.' },
            { href: '/support?source=in_app&page=/dashboard', label: 'الدعم', description: 'بلاغ تشغيل أو متابعة تقنية.', tone: 'support' },
          ] : [
            { href: '/support?source=in_app&page=/dashboard', label: 'طلب دعم', description: 'أرسل مشكلة التشغيل أو اطلب المساعدة.', tone: 'support' },
          ]}
        />
      </MobileShell>
    );
  }

  return (
    <MobileShell title={config.title} topRight={<Link href="/support?source=in_app&page=/dashboard" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">دعم</Link>}>
      {effectiveError ? (
        <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {effectiveError}
        </div>
      ) : null}

      <section className="space-y-4">
        <DashboardStatGrid cards={config.cards} />


        <div>
          <div className="mb-3 text-right text-sm font-bold text-slate-800">تحركات سريعة</div>
          <DashboardActionGrid actions={config.actions} />
        </div>
      </section>
    </MobileShell>
  );
}
