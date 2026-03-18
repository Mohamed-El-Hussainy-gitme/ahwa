'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type {
  BillingWorkspace,
  ComplaintsWorkspace,
  DashboardWorkspace,
  StationWorkspace,
  WaiterWorkspace,
} from '@/lib/ops/types';
import { isPlatformApiOk } from '@/lib/platform-auth/api';

type SupportAccessData = {
  access: {
    messageId: string;
    cafeId: string;
    cafeSlug: string | null;
    cafeDisplayName: string | null;
    databaseKey: string;
    bindingSource: string;
    requestedAt: string | null;
    grantedAt: string | null;
    expiresAt: string | null;
    note: string | null;
  };
  dashboard: DashboardWorkspace;
  waiter: WaiterWorkspace;
  stations: {
    barista: StationWorkspace;
    shisha: StationWorkspace;
  };
  billing: BillingWorkspace;
  complaints: ComplaintsWorkspace;
};

type SupportWorkspaceResponse = {
  ok: true;
  data: SupportAccessData;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSupportWorkspaceResponse(value: unknown): value is SupportWorkspaceResponse {
  return isRecord(value) && value.ok === true && isRecord(value.data);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function amountLabel(value: number) {
  return new Intl.NumberFormat('ar-EG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function MetricCard({ title, value, helper }: { title: string; value: string; helper?: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-medium text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
      {helper ? <div className="mt-2 text-xs text-slate-500">{helper}</div> : null}
    </div>
  );
}

function SectionFrame({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="border-b border-slate-100 pb-4">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function PlatformSupportAccessWorkspaceClient({ messageId }: { messageId: string }) {
  const [data, setData] = useState<SupportAccessData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ messageId });
      const response = await fetch(`/api/platform/support/access/workspace?${params.toString()}`, { cache: 'no-store' });
      const json: unknown = await response.json().catch(() => ({}));
      if (!response.ok || !isPlatformApiOk(json) || !isSupportWorkspaceResponse(json)) {
        throw new Error('تعذر تحميل مساحة الدعم أو أن الوصول المؤقت غير مفعل.');
      }
      setData(json.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل مساحة الدعم.');
    } finally {
      setLoading(false);
    }
  }, [messageId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500">جارٍ تحميل مساحة الدعم...</div>;
  }

  if (error && !data) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  if (!data) {
    return <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500">لا توجد بيانات متاحة.</div>;
  }

  const { access, dashboard, waiter, stations, billing, complaints } = data;

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</div> : null}

      <SectionFrame title="بيانات الوصول المؤقت" description="هذه المساحة متاحة فقط بطلب دعم صريح من القهوة ومحددة بزمن انتهاء واضح.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="القهوة" value={access.cafeDisplayName || access.cafeSlug || '—'} helper={access.cafeSlug || undefined} />
          <MetricCard title="قاعدة التشغيل" value={access.databaseKey} helper={access.bindingSource} />
          <MetricCard title="بداية الوصول" value={formatDateTime(access.grantedAt)} helper={access.requestedAt ? `طلب عند ${formatDateTime(access.requestedAt)}` : undefined} />
          <MetricCard title="ينتهي الوصول" value={formatDateTime(access.expiresAt)} helper={access.note || undefined} />
        </div>
      </SectionFrame>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="الجلسات المفتوحة" value={String(dashboard.openSessions)} />
        <MetricCard title="بانتظار الباريستا" value={String(dashboard.waitingBarista)} />
        <MetricCard title="بانتظار الشيشة" value={String(dashboard.waitingShisha)} />
        <MetricCard title="جاهز للتسليم" value={String(dashboard.readyForDelivery)} />
        <MetricCard title="الكمية القابلة للحساب" value={String(dashboard.billableQty)} />
        <MetricCard title="إجمالي الآجل المفتوح" value={`${amountLabel(dashboard.deferredOutstanding)} ج.م`} />
        <MetricCard title="أقدم انتظار" value={dashboard.queueHealth.oldestPendingMinutes == null ? '—' : `${dashboard.queueHealth.oldestPendingMinutes} دقيقة`} />
        <MetricCard title="جلسات متوقفة" value={String(dashboard.queueHealth.stalledSessionsCount)} helper={`الحد ${dashboard.queueHealth.stalledThresholdMinutes} دقيقة`} />
      </section>

      <SectionFrame title="الجلسات والعمل الجاري" description="قراءة مباشرة لحالة الجلسات الحالية، العناصر الجاهزة، وحدود الانتظار لكل محطة.">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-sm font-semibold text-slate-700">الجلسات المفتوحة</div>
              <div className="space-y-2">
                {waiter.sessions.map((session) => (
                  <div key={session.id} className="rounded-2xl border border-slate-200 p-3">
                    <div className="font-semibold text-slate-900">{session.label}</div>
                    <div className="mt-1 text-xs text-slate-500">جاهز {session.readyCount} • قابل للحساب {session.billableCount}</div>
                  </div>
                ))}
                {!waiter.sessions.length ? <div className="text-sm text-slate-500">لا توجد جلسات مفتوحة حاليًا.</div> : null}
              </div>
            </div>

            <div>
              <div className="mb-2 text-sm font-semibold text-slate-700">العناصر الجاهزة للتسليم</div>
              <div className="space-y-2">
                {waiter.readyItems.slice(0, 20).map((item) => (
                  <div key={item.orderItemId} className="rounded-2xl border border-slate-200 p-3 text-sm">
                    <div className="font-semibold text-slate-900">{item.sessionLabel} • {item.productName}</div>
                    <div className="mt-1 text-xs text-slate-500">{item.stationCode} • جاهز {item.qtyReadyForDelivery}</div>
                  </div>
                ))}
                {!waiter.readyItems.length ? <div className="text-sm text-slate-500">لا توجد عناصر جاهزة الآن.</div> : null}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="text-sm font-semibold text-slate-700">طابور الباريستا</div>
              <div className="mt-3 space-y-2">
                {stations.barista.queue.slice(0, 15).map((item) => (
                  <div key={item.orderItemId} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm">
                    <div className="font-semibold text-slate-900">{item.sessionLabel} • {item.productName}</div>
                    <div className="mt-1 text-xs text-slate-500">بانتظار {item.qtyWaiting}</div>
                  </div>
                ))}
                {!stations.barista.queue.length ? <div className="text-sm text-slate-500">لا يوجد انتظار لدى الباريستا.</div> : null}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="text-sm font-semibold text-slate-700">طابور الشيشة</div>
              <div className="mt-3 space-y-2">
                {stations.shisha.queue.slice(0, 15).map((item) => (
                  <div key={item.orderItemId} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm">
                    <div className="font-semibold text-slate-900">{item.sessionLabel} • {item.productName}</div>
                    <div className="mt-1 text-xs text-slate-500">بانتظار {item.qtyWaiting}</div>
                  </div>
                ))}
                {!stations.shisha.queue.length ? <div className="text-sm text-slate-500">لا يوجد انتظار لدى الشيشة.</div> : null}
              </div>
            </div>
          </div>
        </div>
      </SectionFrame>

      <SectionFrame title="الحساب والآجل" description="قراءة لأرصدة الجلسات القابلة للحساب والأسماء الموجودة في قائمة الآجل.">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-2">
            {billing.sessions.map((session) => (
              <div key={session.sessionId} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">{session.sessionLabel}</div>
                    <div className="mt-1 text-xs text-slate-500">عناصر قابلة للحساب {session.totalBillableQty}</div>
                  </div>
                  <div className="text-sm font-semibold text-slate-900">{amountLabel(session.totalBillableAmount)} ج.م</div>
                </div>
              </div>
            ))}
            {!billing.sessions.length ? <div className="text-sm text-slate-500">لا توجد جلسات قابلة للحساب الآن.</div> : null}
          </div>
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="text-sm font-semibold text-slate-700">أسماء الآجل الحالية</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {billing.deferredNames.map((name) => (
                <span key={name} className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">{name}</span>
              ))}
              {!billing.deferredNames.length ? <div className="text-sm text-slate-500">لا يوجد آجل مفتوح الآن.</div> : null}
            </div>
          </div>
        </div>
      </SectionFrame>

      <SectionFrame title="الشكاوى والملاحظات" description="عرض آخر الشكاوى العامة وإجراءات الأصناف المرتبطة بها للمتابعة الفنية.">
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="space-y-2">
            {complaints.complaints.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-200 p-4 text-sm">
                <div className="font-semibold text-slate-900">{item.sessionLabel} {item.productName ? `• ${item.productName}` : ''}</div>
                <div className="mt-1 text-xs text-slate-500">{item.complaintKind} • {item.status} • {formatDateTime(item.createdAt)}</div>
                {item.notes ? <div className="mt-2 rounded-2xl bg-slate-50 p-3 text-slate-700">{item.notes}</div> : null}
              </div>
            ))}
            {!complaints.complaints.length ? <div className="text-sm text-slate-500">لا توجد شكاوى عامة حديثة.</div> : null}
          </div>
          <div className="space-y-2">
            {complaints.itemIssues.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-200 p-4 text-sm">
                <div className="font-semibold text-slate-900">{item.sessionLabel} • {item.productName}</div>
                <div className="mt-1 text-xs text-slate-500">{item.actionKind} • {item.status} • {formatDateTime(item.createdAt)}</div>
                {item.notes ? <div className="mt-2 rounded-2xl bg-slate-50 p-3 text-slate-700">{item.notes}</div> : null}
              </div>
            ))}
            {!complaints.itemIssues.length ? <div className="text-sm text-slate-500">لا توجد ملاحظات أصناف حديثة.</div> : null}
          </div>
        </div>
      </SectionFrame>

      <div className="flex justify-end">
        <Link href="/platform/support" className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700">العودة إلى صندوق الدعم</Link>
      </div>
    </div>
  );
}
