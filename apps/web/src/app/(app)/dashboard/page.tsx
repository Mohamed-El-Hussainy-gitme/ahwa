'use client';

import { useCallback } from 'react';
import Link, { type LinkProps } from 'next/link';
import { MobileShell } from '@/ui/MobileShell';
import { useAuthz } from '@/lib/authz';
import { opsClient } from '@/lib/ops/client';
import type { DashboardWorkspace } from '@/lib/ops/types';
import { useOpsWorkspace } from '@/lib/ops/hooks';
import { useOpsChrome } from '@/lib/ops/chrome';
import { AppIcon } from '@/ui/icons/AppIcon';

type StatCard = {
  label: string;
  value: number | string;
  hint?: string;
  tone?: 'neutral' | 'success' | 'warning' | 'info';
};

type ActionCard = {
  href: LinkProps['href'];
  label: string;
  description: string;
  tone?: 'primary' | 'secondary' | 'support';
  icon:
    | 'clock'
    | 'orders'
    | 'wallet'
    | 'lifebuoy'
    | 'crown'
    | 'checkCircle'
    | 'users'
    | 'coffee'
    | 'shisha'
    | 'support';
};

type RoleView = 'owner' | 'supervisor' | 'waiter' | 'barista' | 'shisha' | 'unassigned';

type RoleConfig = {
  title: string;
  eyebrow: string;
  summary: string;
  cards: StatCard[];
  actions: ActionCard[];
};

function SupportLink() {
  return (
    <Link
      href="/support?source=in_app&page=/dashboard"
      className="inline-flex items-center gap-2 rounded-2xl border border-[#dccdbb] bg-white px-3 py-2 text-xs font-semibold text-[#6b5a4c] shadow-sm"
    >
      <AppIcon name="support" className="h-4 w-4" />
      دعم
    </Link>
  );
}

function DashboardActionGrid({ actions }: { actions: ActionCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {actions.map((action) => {
        const tone =
          action.tone === 'primary'
            ? {
                shell: 'border-[#1e1712] bg-[linear-gradient(180deg,#2a2018_0%,#1e1712_100%)] text-white shadow-[0_18px_34px_rgba(30,23,18,0.18)]',
                icon: 'bg-white/12 text-[#f1e1cb]',
                desc: 'text-white/76',
                arrow: 'text-[#f1e1cb]',
              }
            : action.tone === 'support'
              ? {
                  shell: 'border-[#ead5b8] bg-[linear-gradient(180deg,#fbf3e8_0%,#f5e6d1_100%)] text-[#7c5222]',
                  icon: 'bg-[#fff8ef] text-[#9b6b2e]',
                  desc: 'text-[#8b6b44]',
                  arrow: 'text-[#9b6b2e]',
                }
              : {
                  shell: 'border-[#dccdbb] bg-[#fffaf4] text-[#1e1712] shadow-sm',
                  icon: 'bg-[#f6ede2] text-[#7c5222]',
                  desc: 'text-[#6b5a4c]',
                  arrow: 'text-[#9b6b2e]',
                };

        return (
          <Link
            key={`${String(action.href)}-${action.label}`}
            href={action.href}
            className={[
              'group rounded-[24px] border p-4 text-right transition duration-150 hover:-translate-y-0.5',
              tone.shell,
            ].join(' ')}
          >
            <div className="flex items-start justify-between gap-3">
              <div className={["flex h-11 w-11 items-center justify-center rounded-[18px]", tone.icon].join(' ')}>
                <AppIcon name={action.icon} className="h-5 w-5" />
              </div>
              <AppIcon name="chevronRight" className={["mt-1 h-4 w-4 transition group-hover:-translate-x-0.5", tone.arrow].join(' ')} />
            </div>
            <div className="mt-4 text-base font-bold">{action.label}</div>
            <div className={["mt-2 text-sm leading-6", tone.desc].join(' ')}>{action.description}</div>
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
          card.tone === 'success'
            ? 'border-[#cfe0d7] bg-[#eff7f1]'
            : card.tone === 'warning'
              ? 'border-[#ecd9bd] bg-[#fcf3e7]'
              : card.tone === 'info'
                ? 'border-[#d6dee5] bg-[#f4f7f9]'
                : 'border-[#dccdbb] bg-[#fffaf4]';

        return (
          <div key={card.label} className={[
            'rounded-[22px] border p-4 text-right shadow-sm',
            tone,
          ].join(' ')}>
            <div className="text-[28px] font-black leading-none text-[#1e1712]">{card.value}</div>
            <div className="mt-2 text-sm font-semibold text-[#4e4034]">{card.label}</div>
            {card.hint ? <div className="mt-2 text-xs text-[#7d6b5a]">{card.hint}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

function DashboardHero({ title, eyebrow, summary }: { title: string; eyebrow: string; summary: string }) {
  return (
    <section className="rounded-[28px] border border-[#dccdbb] bg-[linear-gradient(180deg,#fff9f2_0%,#f6ecdf_100%)] p-5 shadow-[0_18px_40px_rgba(30,23,18,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.24em] text-[#9b6b2e]">{eyebrow}</div>
          <h1 className="mt-2 text-[26px] font-black leading-tight text-[#1e1712]">{title}</h1>
          <p className="mt-2 text-sm leading-7 text-[#6b5a4c]">{summary}</p>
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-[#ead5b8] bg-white/80 text-[#9b6b2e] shadow-sm">
          <AppIcon name="spark" className="h-5 w-5" />
        </div>
      </div>
    </section>
  );
}

function buildRoleConfig(role: RoleView, data: DashboardWorkspace | undefined, deferredCustomerCount = 0): RoleConfig {
  const stalledSessions = data?.queueHealth.stalledSessionsCount ?? 0;
  const deferredOutstanding = Math.round(data?.deferredOutstanding ?? 0);

  if (role === 'owner') {
    return {
      title: 'المالك',
      eyebrow: 'مركز المتابعة',
      summary: 'نقطة متابعة يومية مركزة لمستوى الجاهزية، الحساب، وحركة التشغيل داخل القهوة.',
      cards: [
        { label: 'جاهز للحساب', value: data?.billableQty ?? 0, tone: 'success' },
        { label: 'جلسات متأخرة', value: stalledSessions, tone: stalledSessions > 0 ? 'warning' : 'neutral' },
        { label: 'عملاء الآجل', value: deferredCustomerCount, hint: `رصيد ${deferredOutstanding} ج`, tone: deferredCustomerCount > 0 ? 'warning' : 'neutral' },
      ],
      actions: [
        { href: '/shift', label: 'الوردية', description: 'فتح الوردية، توزيع الأدوار، وضبط بداية التشغيل.', tone: 'primary', icon: 'clock' },
        { href: '/orders', label: 'الطلبات', description: 'متابعة الجلسات والطلبات الجارية والتسليم المباشر.', icon: 'orders' },
        { href: '/billing', label: 'الحساب', description: 'تحصيل الفواتير أو ترحيلها إلى الآجل عند الحاجة.', icon: 'wallet' },
        { href: '/complaints', label: 'الشكاوى', description: 'مراجعة المعالجات والإعادة لضمان جودة الخدمة.', icon: 'lifebuoy' },
        { href: '/owner', label: 'الإدارة', description: 'المنيو، فريق العمل، والتقارير في مساحة واحدة.', icon: 'crown' },
        { href: '/support?source=in_app&page=/dashboard', label: 'الدعم', description: 'بلاغ تشغيلي أو وصول مؤقت للدعم الفني.', tone: 'support', icon: 'support' },
      ],
    };
  }

  if (role === 'supervisor') {
    return {
      title: 'مشرف التشغيل',
      eyebrow: 'مكتب التشغيل',
      summary: 'عرض مختصر للحركة اليومية يساعد على ضبط الجاهز، المتأخر، والحساب بدون تشتيت.',
      cards: [
        { label: 'جاهز للحساب', value: data?.billableQty ?? 0, tone: 'success' },
        { label: 'جلسات متأخرة', value: stalledSessions, tone: stalledSessions > 0 ? 'warning' : 'neutral' },
        { label: 'أسماء الآجل', value: deferredCustomerCount, tone: deferredCustomerCount > 0 ? 'warning' : 'neutral' },
      ],
      actions: [
        { href: '/orders', label: 'الطلبات', description: 'إدارة الجلسات والمنيو وإرسال الطلبات للأقسام.', tone: 'primary', icon: 'orders' },
        { href: '/ready', label: 'الجاهز', description: 'مراجعة الجاهز للتسليم وإنهاء الحركة بسرعة.', icon: 'checkCircle' },
        { href: '/billing', label: 'الحساب', description: 'تحصيل أو ترحيل إلى الآجل حسب حالة العميل.', icon: 'wallet' },
        { href: '/customers', label: 'دفتر الآجل', description: 'مراجعة الأرصدة والسداد وحركة العملاء.', icon: 'users' },
        { href: '/complaints', label: 'الشكاوى', description: 'تسجيل الشكوى وتنفيذ المعالجة التشغيلية.', icon: 'lifebuoy' },
        { href: '/support?source=in_app&page=/dashboard', label: 'الدعم', description: 'بلاغ تشغيل أو مشكلة مباشرة أثناء الوردية.', tone: 'support', icon: 'support' },
      ],
    };
  }

  if (role === 'barista') {
    return {
      title: 'الباريستا',
      eyebrow: 'محطة الباريستا',
      summary: 'واجهة سريعة لمراقبة الانتظار، متابعة الطابور، واعتماد الجاهز دون عناصر زائدة.',
      cards: [
        { label: 'جلسات مفتوحة', value: data?.openSessions ?? 0, tone: 'info' },
        { label: 'جلسات متأخرة', value: stalledSessions, tone: stalledSessions > 0 ? 'warning' : 'neutral' },
      ],
      actions: [
        { href: '/kitchen#queue-panel', label: 'طابور الباريستا', description: 'راجع الانتظار واعتمد الطلبات الجاهزة أولًا بأول.', tone: 'primary', icon: 'coffee' },
        { href: '/support?source=in_app&page=/dashboard', label: 'الدعم', description: 'عطل أو مشكلة تشغيل تحتاج تدخلًا سريعًا.', tone: 'support', icon: 'support' },
      ],
    };
  }

  if (role === 'shisha') {
    return {
      title: 'مختص الشيشة',
      eyebrow: 'محطة الشيشة',
      summary: 'عرض عملي للطابور الجاري مع تركيز واضح على الطلبات المعلقة وزمن الانتظار.',
      cards: [
        { label: 'جلسات مفتوحة', value: data?.openSessions ?? 0, tone: 'info' },
        { label: 'جلسات متأخرة', value: stalledSessions, tone: stalledSessions > 0 ? 'warning' : 'neutral' },
      ],
      actions: [
        { href: '/shisha#queue-panel', label: 'طلبات الشيشة', description: 'مراجعة الانتظار وتجهيز الطلبات بحسب الأولوية.', tone: 'primary', icon: 'shisha' },
        { href: '/support?source=in_app&page=/dashboard', label: 'الدعم', description: 'عطل أو مشكلة تشغيل داخل القسم.', tone: 'support', icon: 'support' },
      ],
    };
  }

  if (role === 'waiter') {
    return {
      title: 'مضيف الصالة',
      eyebrow: 'خدمة الصالة',
      summary: 'لوحة خدمة ميدانية لمتابعة الجلسات، استلام الجاهز، وتسريع التجربة داخل الصالة.',
      cards: [
        { label: 'جاهز للحساب', value: data?.billableQty ?? 0, tone: 'success' },
        { label: 'جلسات مفتوحة', value: data?.openSessions ?? 0, tone: 'info' },
      ],
      actions: [
        { href: '/orders', label: 'الطلبات', description: 'الجلسات والمنيو وإرسال الطلبات من الصالة مباشرة.', tone: 'primary', icon: 'orders' },
        { href: '/ready', label: 'الجاهز', description: 'مراجعة الجاهز للتسليم وتسليمه للعميل بسرعة.', icon: 'checkCircle' },
        { href: '/support?source=in_app&page=/dashboard', label: 'الدعم', description: 'طلب مساعدة أو بلاغ تشغيل من الصالة.', tone: 'support', icon: 'support' },
      ],
    };
  }

  return {
    title: 'التشغيل',
    eyebrow: 'التشغيل',
    summary: 'واجهة متابعة أساسية حتى يتم استكمال التعيين داخل الوردية.',
    cards: [],
    actions: [{ href: '/support?source=in_app&page=/dashboard', label: 'الدعم', description: 'أرسل الملاحظة أو المشكلة من هنا.', tone: 'support', icon: 'support' }],
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
      <MobileShell title="الرئيسية" topRight={<SupportLink />}>
        <section className="space-y-4">
          <DashboardHero
            title={can.owner ? 'بداية يوم التشغيل' : 'بانتظار تفعيل الوردية'}
            eyebrow="بداية التشغيل"
            summary={can.owner
              ? 'لا توجد وردية مفتوحة الآن. ابدأ الوردية أولًا ليظهر لك ملخص الحركة والإدارة.'
              : 'لا توجد وردية مفتوحة أو لم يتم تعيينك داخل وردية نشطة حتى الآن.'}
          />

          <div className="rounded-[24px] border border-[#ead5b8] bg-[#fcf3e7] p-4 text-right text-sm leading-7 text-[#7c5222] shadow-sm">
            {can.owner
              ? 'بعد فتح الوردية ستظهر لك مؤشرات الجاهزية والحساب والحركة اليومية بشكل مباشر.'
              : 'يمكنك استخدام الدعم لطلب التفعيل أو مراجعة وضعك داخل الوردية الحالية.'}
          </div>

          <DashboardActionGrid
            actions={can.owner ? [
              { href: '/shift', label: 'فتح وردية', description: 'حدد مشرف التشغيل وباقي الفريق ثم ابدأ الوردية.', tone: 'primary', icon: 'clock' },
              { href: '/owner', label: 'الإدارة', description: 'راجع المنيو وفريق العمل قبل بداية التشغيل.', icon: 'crown' },
              { href: '/support?source=in_app&page=/dashboard', label: 'الدعم', description: 'بلاغ تشغيل أو متابعة تقنية مباشرة.', tone: 'support', icon: 'support' },
            ] : [
              { href: '/support?source=in_app&page=/dashboard', label: 'طلب دعم', description: 'أرسل مشكلة التشغيل أو اطلب المساندة من هنا.', tone: 'support', icon: 'support' },
            ]}
          />
        </section>
      </MobileShell>
    );
  }

  return (
    <MobileShell title={config.title} topRight={<SupportLink />}>
      <section className="space-y-4">
        <DashboardHero title={config.title} eyebrow={config.eyebrow} summary={config.summary} />

        {effectiveError ? (
          <div className="rounded-[22px] border border-[#e6c7c2] bg-[#fff3f1] p-3 text-sm text-[#9a3e35]">
            {effectiveError}
          </div>
        ) : null}

        <DashboardStatGrid cards={config.cards} />

        <div>
          <div className="mb-3 text-right text-sm font-bold text-[#4e4034]">تحركات سريعة</div>
          <DashboardActionGrid actions={config.actions} />
        </div>
      </section>
    </MobileShell>
  );
}
