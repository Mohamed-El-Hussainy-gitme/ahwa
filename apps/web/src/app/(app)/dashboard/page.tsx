'use client';

import { useCallback } from 'react';
import Link, { type LinkProps } from 'next/link';
import { MobileShell } from '@/ui/MobileShell';
import { useAuthz } from '@/lib/authz';
import { opsClient } from '@/lib/ops/client';
import type { DashboardWorkspace } from '@/lib/ops/types';
import { useOpsWorkspace } from '@/lib/ops/hooks';
import { OPS_SCOPE_DASHBOARD } from '@/lib/ops/workspaceScopes';
import { useOpsChrome } from '@/lib/ops/chrome';
import { QueueHealthStrip } from '@/ui/ops/QueueHealthStrip';
import { OperationalHealthPanel } from '@/ui/ops/OperationalHealthPanel';

type StatCard = { label: string; value: number | string; hint?: string };
type ActionCard = { href: LinkProps['href']; label: string; description: string; tone?: 'primary' | 'secondary' | 'support' };

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
            <div className={`mt-2 text-sm ${action.tone === 'primary' ? 'text-white/80' : action.tone === 'support' ? 'text-indigo-900/80' : 'text-slate-600'}`}>{action.description}</div>
          </Link>
        );
      })}
    </div>
  );
}

function DashboardStatGrid({ cards }: { cards: StatCard[] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((card) => (
        <div key={card.label} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-right">
          <div className="text-2xl font-bold text-slate-900">{card.value}</div>
          <div className="mt-1 text-sm text-slate-700">{card.label}</div>
          {card.hint ? <div className="mt-2 text-xs text-slate-500">{card.hint}</div> : null}
        </div>
      ))}
    </div>
  );
}

function buildRoleConfig(role: RoleView, data: DashboardWorkspace | undefined, deferredCustomerCount: number = 0): { heading: string; description: string; cards: StatCard[]; actions: ActionCard[] } {
  if (role === 'owner') {
    return {
      heading: 'لوحة المعلم',
      description: 'لك صلاحية كاملة على التشغيل. راقب سير الشغل الآن، ثم ادخل لأي جزء وتدخل مباشرة عند الحاجة.',
      cards: [
        { label: 'جلسات مفتوحة', value: data?.openSessions ?? 0 },
        { label: 'جاهز للتسليم', value: data?.readyForDelivery ?? 0 },
        { label: 'جاهز للحساب', value: data?.billableQty ?? 0 },
        { label: 'رصيد الآجل', value: Math.round(data?.deferredOutstanding ?? 0) },
        { label: 'انتظار الباريستا', value: data?.waitingBarista ?? 0 },
        { label: 'انتظار الشيشة', value: data?.waitingShisha ?? 0 },
      ],
      actions: [
        { href: '/shift', label: 'الوردية', description: 'افتح أو اقفل الوردية ووزع الأدوار الحالية.', tone: 'primary' },
        { href: '/orders', label: 'الطلبات', description: 'ادخل على الجلسات والطلبات والتسليم مباشرة.' },
        { href: '/billing', label: 'الحساب', description: 'تحصيل المحدد أو ترحيله إلى الآجل.' },
        { href: '/complaints', label: 'الشكاوى', description: 'راجع الشكاوى ونفذ الإعادة أو الإسقاط.' },
        { href: '/owner', label: 'إدارة القهوة', description: 'الموظفون والمنيو والتقارير والإعدادات.' },
        { href: '/support?source=in_app&page=/dashboard', label: 'الدعم', description: 'أرسل طلب دعم أو اسمح بدخول دعم مؤقت عند الحاجة.', tone: 'support' },
      ],
    };
  }

  if (role === 'supervisor') {
    return {
      heading: 'لوحة المشرف',
      description: 'أنت مسؤول عن الطلبات والحساب والآجل والشكاوى. ابدأ بالجالسات المفتوحة ثم أكمل التسليم والتحصيل.',
      cards: [
        { label: 'جلسات مفتوحة', value: data?.openSessions ?? 0 },
        { label: 'جاهز للتسليم', value: data?.readyForDelivery ?? 0 },
        { label: 'جاهز للحساب', value: data?.billableQty ?? 0 },
        { label: 'أسماء آجل مفتوحة', value: deferredCustomerCount },
      ],
      actions: [
        { href: '/orders', label: 'الطلبات والتسليم', description: 'استقبل الطلبات وسلم الجاهز للعميل.', tone: 'primary' },
        { href: '/billing', label: 'الحساب', description: 'اختر المحدد ثم حصّل أو رحّل إلى الآجل.' },
        { href: '/customers', label: 'دفتر الآجل', description: 'راجع الأرصدة، السداد، والحركات المفتوحة.' },
        { href: '/complaints', label: 'الشكاوى', description: 'سجل الشكوى ونفذ المعالجة المسموح بها.' },
        { href: '/support?source=in_app&page=/dashboard', label: 'الدعم', description: 'أرسل شكوى تشغيل أو اطلب دخول دعم مؤقت للقهوة.', tone: 'support' },
      ],
    };
  }

  if (role === 'barista') {
    return {
      heading: 'لوحة الباريستا',
      description: 'هذه شاشتك الرئيسية للمطبخ. ركز على طابور المشروبات والأكل ثم علّم الجاهز أولًا بأول.',
      cards: [
        { label: 'بانتظار الباريستا', value: data?.waitingBarista ?? 0 },
        { label: 'جلسات مفتوحة', value: data?.openSessions ?? 0 },
      ],
      actions: [
        { href: '/kitchen', label: 'مطبخ الباريستا', description: 'افتح الطابور وحدد الكمية الجاهزة ثم علّمها جاهزة.', tone: 'primary' },
        { href: '/support?source=in_app&page=/dashboard', label: 'الدعم', description: 'لو في عطل أو مشكلة تشغيل، أرسلها من هنا.', tone: 'support' },
      ],
    };
  }

  if (role === 'shisha') {
    return {
      heading: 'لوحة الشيشة',
      description: 'أنت مسؤول عن طلبات قسم الشيشة فقط: استلام الطلب، التجهيز، ثم التسليم للعميل.',
      cards: [
        { label: 'بانتظار الشيشة', value: data?.waitingShisha ?? 0 },
        { label: 'جاهز للتسليم', value: data?.readyForDelivery ?? 0, hint: 'يشمل ما ينتظر التسليم من قسمك.' },
      ],
      actions: [
        { href: '/shisha', label: 'طلبات الشيشة', description: 'خذ الطلبات الخاصة بقسم الشيشة، جهزها، ثم سلمها.', tone: 'primary' },
        { href: '/support?source=in_app&page=/dashboard', label: 'الدعم', description: 'أرسل مشكلة تشغيل أو اطلب مساعدة من المعلم.', tone: 'support' },
      ],
    };
  }

  if (role === 'waiter') {
    return {
      heading: 'لوحة الويتر',
      description: 'ابدأ من الجلسات المفتوحة. خذ الطلبات ثم راقب الجاهز القادم من المطبخ وابدأ التسليم.',
      cards: [
        { label: 'جلسات مفتوحة', value: data?.openSessions ?? 0 },
        { label: 'جاهز للتسليم', value: data?.readyForDelivery ?? 0 },
        { label: 'انتظار الباريستا', value: data?.waitingBarista ?? 0 },
      ],
      actions: [
        { href: '/orders', label: 'الطلبات والجاهز', description: 'افتح جلسة، أرسل الطلب، ثم تابع الجاهز للتسليم.', tone: 'primary' },
        { href: '/support?source=in_app&page=/dashboard', label: 'الدعم', description: 'إذا احتجت المساعدة، أرسل رسالة من هنا.', tone: 'support' },
      ],
    };
  }

  return {
    heading: 'أنت داخل القهوة الآن',
    description: 'لم يتم ربطك بدور نشط داخل الوردية بعد. اطلب من المعلم فتح وردية وتحديد دورك.',
    cards: [
      { label: 'جلسات مفتوحة', value: data?.openSessions ?? 0 },
      { label: 'جاهز للتسليم', value: data?.readyForDelivery ?? 0 },
    ],
    actions: [{ href: '/support?source=in_app&page=/dashboard', label: 'الدعم', description: 'أرسل الملاحظة أو المشكلة التشغيلية من هنا.', tone: 'support' }],
  };
}

export default function DashboardPage() {
  const { can, shift, effectiveRole } = useAuthz();
  const loader = useCallback(() => opsClient.dashboardWorkspace(), []);
  const { data, error } = useOpsWorkspace<DashboardWorkspace>(loader, { enabled: Boolean(shift), scopes: [OPS_SCOPE_DASHBOARD] });
  const { summary, sync, lastLoadedAt } = useOpsChrome();

  const role: RoleView = can.owner ? 'owner' : effectiveRole ?? 'unassigned';
  const config = buildRoleConfig(role, data ?? undefined, summary?.deferredCustomerCount ?? 0);

  if (!shift) {
    return (
      <MobileShell title="الرئيسية" topRight={<Link href="/support?source=in_app&page=/dashboard" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">دعم</Link>}>
        <div className="mb-3 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-right text-sm text-amber-950">
          {can.owner
            ? 'لا توجد وردية مفتوحة الآن. ابدأ بفتح وردية وتحديد المشرف والباريستا وباقي الفريق، ثم ارجع لهذه الصفحة لمتابعة الشغل.'
            : 'لا توجد وردية مفتوحة أو لم يتم تعيينك داخل وردية نشطة. تواصل مع المعلم أو المشرف لتشغيلك.'}
        </div>
        <DashboardActionGrid
          actions={can.owner ? [
            { href: '/shift', label: 'فتح وردية', description: 'حدد المشرف والباريستا وباقي الفريق ثم افتح الوردية.', tone: 'primary' },
            { href: '/owner', label: 'إدارة القهوة', description: 'راجع المنيو والموظفين والتقارير قبل بدء التشغيل.' },
            { href: '/support?source=in_app&page=/dashboard', label: 'الدعم', description: 'أرسل طلب دعم أو اطلب متابعة تقنية.', tone: 'support' },
          ] : [
            { href: '/support?source=in_app&page=/dashboard', label: 'طلب دعم', description: 'أرسل مشكلة التشغيل أو اطلب المساعدة من الإدارة.', tone: 'support' },
          ]}
        />
      </MobileShell>
    );
  }

  return (
    <MobileShell title="الرئيسية" topRight={<Link href="/support?source=in_app&page=/dashboard" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">دعم</Link>}>
      {error ? (
        <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <OperationalHealthPanel summary={summary} syncState={sync.state} lastLoadedAt={lastLoadedAt} className="mb-3" />
      <QueueHealthStrip health={summary?.queueHealth ?? data?.queueHealth ?? null} className="mb-3" />

      <section className="mb-4 rounded-3xl border border-slate-200 bg-white p-4 text-right shadow-sm">
        <div className="text-lg font-bold text-slate-950">{config.heading}</div>
        <div className="mt-2 text-sm leading-6 text-slate-600">{config.description}</div>
      </section>

      <section className="mb-4">
        <div className="mb-3 text-right text-sm font-bold text-slate-800">الوضع الآن</div>
        <DashboardStatGrid cards={config.cards} />
      </section>

      <section>
        <div className="mb-3 text-right text-sm font-bold text-slate-800">ماذا تريد أن تفعل الآن؟</div>
        <DashboardActionGrid actions={config.actions} />
      </section>
    </MobileShell>
  );
}
