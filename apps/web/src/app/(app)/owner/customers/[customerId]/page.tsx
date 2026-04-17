'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { MobileShell } from '@/ui/MobileShell';
import { AccessDenied } from '@/ui/AccessState';
import { useAuthz } from '@/lib/authz';
import { extractApiErrorMessage } from '@/lib/api/errors';
import type { CustomerAlias, CustomerIntelligenceWorkspace } from '@/lib/ops/types';
import {
  opsAccentButton,
  opsAlert,
  opsBadge,
  opsGhostButton,
  opsInset,
  opsInput,
  opsMetricCard,
  opsSectionHint,
  opsSectionTitle,
  opsSurface,
} from '@/ui/ops/premiumStyles';

function formatMoney(value: number) {
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(value ?? 0);
}

function formatDateTime(value: string | null) {
  if (!value) return 'غير متوفر';
  return new Date(value).toLocaleString('ar-EG');
}

function aliasSourceLabel(source: CustomerAlias['source']) {
  switch (source) {
    case 'billing_runtime':
      return 'ترحيل فواتير';
    case 'deferred_runtime':
      return 'حركة آجل';
    case 'imported':
      return 'استيراد';
    default:
      return 'يدوي';
  }
}

export default function OwnerCustomerDetailPage() {
  const { can } = useAuthz();
  const params = useParams<{ customerId: string }>();
  const customerId = String(params.customerId ?? '').trim();
  const [workspace, setWorkspace] = useState<CustomerIntelligenceWorkspace | null>(null);
  const [aliasText, setAliasText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!customerId) return false;
    setMessage(null);
    const response = await fetch(`/api/owner/customers/${encodeURIComponent(customerId)}/intelligence`, { cache: 'no-store' });
    const payload = await response.json().catch(() => null);
    if (!payload?.ok) {
      setWorkspace(null);
      setMessage(extractApiErrorMessage(payload, 'CUSTOMER_INTELLIGENCE_FAILED'));
      return false;
    }
    setWorkspace(payload.workspace as CustomerIntelligenceWorkspace);
    return true;
  }, [customerId]);

  useEffect(() => {
    if (!can.owner || !customerId) return;
    void refresh();
  }, [can.owner, customerId, refresh]);

  const customer = workspace?.customer ?? null;

  const customerStats = useMemo(() => {
    if (!workspace) {
      return { aliases: 0, products: 0, baskets: 0, notes: 0 };
    }
    return {
      aliases: workspace.aliases.length,
      products: workspace.recommendedProducts.length,
      baskets: workspace.recommendedBaskets.length,
      notes: workspace.recommendedNotes.length,
    };
  }, [workspace]);

  async function addAlias() {
    const value = aliasText.trim();
    if (!value || !customerId) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/owner/customers/${encodeURIComponent(customerId)}/aliases`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ aliasText: value }),
      });
      const payload = await response.json().catch(() => null);
      if (!payload?.ok) {
        setMessage(extractApiErrorMessage(payload, 'CUSTOMER_ALIAS_FAILED'));
        return;
      }
      setAliasText('');
      await refresh();
      setMessage('تم حفظ الاسم البديل وربطه بتاريخ الآجل المطابق له بالاسم نفسه فقط.');
    } finally {
      setBusy(false);
    }
  }

  async function removeAlias(alias: CustomerAlias) {
    if (!customerId) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/owner/customers/${encodeURIComponent(customerId)}/aliases/${encodeURIComponent(alias.id)}`, {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => null);
      if (!payload?.ok) {
        setMessage(extractApiErrorMessage(payload, 'CUSTOMER_ALIAS_DELETE_FAILED'));
        return;
      }
      await refresh();
      setMessage('تم حذف الاسم البديل من الربط الذكي.');
    } finally {
      setBusy(false);
    }
  }

  if (!can.owner) {
    return <AccessDenied title="ذكاء العميل" />;
  }

  return (
    <MobileShell title={customer?.fullName ?? 'ذكاء العميل'} backHref="/owner/customers" desktopMode="admin">
      {message ? <div className={[opsAlert(message.startsWith('تم ') ? 'success' : 'danger'), 'mb-3'].join(' ')}>{message}</div> : null}

      <section className={[opsSurface, 'p-4'].join(' ')}>
        <div className="flex items-start justify-between gap-3">
          <div className="text-right">
            <div className={opsSectionTitle}>ملف العميل الذكي</div>
            <div className={[opsSectionHint, 'mt-1'].join(' ')}>
              الربط يعتمد على المطابقة المؤكدة فقط.
            </div>
          </div>
          <div className={opsBadge(customer?.isActive ? 'success' : 'warning')}>{customer?.isActive ? 'نشط' : 'موقوف'}</div>
        </div>

        {customer ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className={[opsInset, 'p-3 text-right'].join(' ')}>
              <div className="text-sm font-bold text-[#1e1712]">{customer.fullName}</div>
              <div className="mt-1 text-xs text-[#7d6a59]">{customer.phoneRaw}</div>
              <div className="mt-2 flex flex-wrap justify-end gap-2 text-xs text-[#7d6a59]">
                {customer.favoriteDrinkLabel ? <span className={opsBadge('accent')}>المفضل: {customer.favoriteDrinkLabel}</span> : null}
                {customer.address ? <span className={opsBadge('neutral')}>العنوان محفوظ</span> : null}
              </div>
              {customer.notes ? <div className="mt-3 text-sm leading-6 text-[#5e4d3f]">{customer.notes}</div> : null}
            </div>
            <div className={[opsInset, 'p-3 text-right text-sm text-[#6b5a4c]'].join(' ')}>
              <div>آخر ظهور: {formatDateTime(customer.lastSeenAt)}</div>
              <div className="mt-2">آخر تعديل: {formatDateTime(customer.updatedAt)}</div>
              <div className="mt-2">الأسماء البديلة النشطة: {customerStats.aliases}</div>
              <div className="mt-2">آخر حركة آجل: {formatDateTime(workspace?.deferredSummary.lastEntryAt ?? null)}</div>
            </div>
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <MetricCard label="الرصيد المرتبط" value={`${formatMoney(workspace?.deferredSummary.outstandingBalance ?? 0)} ج`} tone="accent" />
          <MetricCard label="إجمالي الترحيل" value={`${formatMoney(workspace?.deferredSummary.debtTotal ?? 0)} ج`} tone="info" />
          <MetricCard label="إجمالي السداد" value={`${formatMoney(workspace?.deferredSummary.repaymentTotal ?? 0)} ج`} tone="success" />
          <MetricCard label="حركات مرتبطة" value={workspace?.deferredSummary.entryCount ?? 0} tone="neutral" />
        </div>
      </section>

      <section className={[opsSurface, 'mt-4 p-4'].join(' ')}>
        <div className="flex items-start justify-between gap-3">
          <div className="text-right">
            <div className={opsSectionTitle}>الأسماء البديلة المؤكدة</div>
            <div className={[opsSectionHint, 'mt-1'].join(' ')}>
              أضف الاسم كما ظهر فعليًا في الآجل أو الترحيل.
            </div>
          </div>
          <div className={opsBadge('info')}>{workspace?.aliases.length ?? 0}</div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <input
            className={[opsInput, 'flex-1 min-w-[220px]'].join(' ')}
            value={aliasText}
            placeholder="اسم بديل مؤكد مثل الاسم المستخدم في الآجل"
            onChange={(event) => setAliasText(event.target.value)}
          />
          <button type="button" className={opsAccentButton} disabled={busy || !aliasText.trim()} onClick={() => void addAlias()}>
            {busy ? '...' : 'إضافة الاسم البديل'}
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {(workspace?.aliases ?? []).length === 0 ? (
            <div className={[opsInset, 'p-4 text-center text-sm text-[#7d6a59]'].join(' ')}>
              لا توجد أسماء بديلة محفوظة بعد.
            </div>
          ) : (
            workspace?.aliases.map((alias) => (
              <div key={alias.id} className="rounded-[20px] border border-[#decdb9] bg-[#fffaf4] p-3 text-right shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-base font-bold text-[#1e1712]">{alias.aliasText}</div>
                    <div className="mt-1 text-xs text-[#7d6a59]">المصدر: {aliasSourceLabel(alias.source)} • الاستخدام: {alias.usageCount}</div>
                    <div className="mt-2 text-xs text-[#7d6a59]">آخر استخدام: {formatDateTime(alias.lastUsedAt)}</div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Link href={`/customers/${encodeURIComponent(alias.aliasText)}`} className={opsGhostButton}>كشف الآجل</Link>
                    <button type="button" className={opsGhostButton} disabled={busy} onClick={() => void removeAlias(alias)}>حذف</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <InsightCard title="الطلبات المرشحة" hint="من التاريخ المؤكد فقط.">
          {(workspace?.recommendedProducts ?? []).length === 0 ? (
            <EmptyText text="لا توجد جلسات ترحيل كافية لاستخراج أصناف مرشحة بعد." />
          ) : (
            <div className="space-y-2">
              {workspace?.recommendedProducts.map((item) => (
                <div key={item.productName} className={[opsInset, 'p-3 text-right'].join(' ')}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-bold text-[#1e1712]">{item.productName}</div>
                    <div className={opsBadge('accent')}>{item.count} مرات</div>
                  </div>
                  <div className="mt-2 text-xs text-[#7d6a59]">إجمالي الكمية {item.quantity} • آخر مرة {formatDateTime(item.lastOrderedAt)}</div>
                </div>
              ))}
            </div>
          )}
        </InsightCard>

        <InsightCard title="الإضافات المرشحة" hint="الأكثر تكرارًا.">
          {(workspace?.recommendedAddons ?? []).length === 0 ? (
            <EmptyText text="لا توجد إضافات مرتبطة كفاية حتى الآن." />
          ) : (
            <div className="space-y-2">
              {workspace?.recommendedAddons.map((item) => (
                <div key={item.addonName} className={[opsInset, 'p-3 text-right'].join(' ')}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-bold text-[#1e1712]">{item.addonName}</div>
                    <div className={opsBadge('info')}>{item.count} مرات</div>
                  </div>
                  <div className="mt-2 text-xs text-[#7d6a59]">إجمالي الكمية {item.quantity} • آخر مرة {formatDateTime(item.lastOrderedAt)}</div>
                </div>
              ))}
            </div>
          )}
        </InsightCard>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <InsightCard title="ملاحظات متكررة" hint="ملاحظات متكررة.">
          {(workspace?.recommendedNotes ?? []).length === 0 ? (
            <EmptyText text="لا توجد ملاحظات متكررة مؤكدة بعد." />
          ) : (
            <div className="space-y-2">
              {workspace?.recommendedNotes.map((item) => (
                <div key={item.noteText} className={[opsInset, 'p-3 text-right'].join(' ')}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-bold text-[#1e1712]">{item.noteText}</div>
                    <div className={opsBadge('warning')}>{item.count} مرات</div>
                  </div>
                  <div className="mt-2 text-xs text-[#7d6a59]">آخر مرة {formatDateTime(item.lastUsedAt)}</div>
                </div>
              ))}
            </div>
          )}
        </InsightCard>

        <InsightCard title="طلبات معتادة" hint="باسكت متكررة.">
          {(workspace?.recommendedBaskets ?? []).length === 0 ? (
            <EmptyText text="لا توجد باسكت متكررة بدرجة كافية بعد." />
          ) : (
            <div className="space-y-2">
              {workspace?.recommendedBaskets.map((item) => (
                <div key={item.label} className={[opsInset, 'p-3 text-right'].join(' ')}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-bold leading-6 text-[#1e1712]">{item.label}</div>
                    <div className={opsBadge('success')}>{item.count} مرات</div>
                  </div>
                  <div className="mt-2 text-xs text-[#7d6a59]">عدد الأصناف في الباسكت {item.itemCount} • آخر مرة {formatDateTime(item.lastOrderedAt)}</div>
                </div>
              ))}
            </div>
          )}
        </InsightCard>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <InsightCard title="آخر جلسات مترابطة" hint="آخر جلسات مرتبطة.">
          {(workspace?.recentSessions ?? []).length === 0 ? (
            <EmptyText text="لا توجد جلسات مرحّلة مرتبطة بعد." />
          ) : (
            <div className="space-y-2">
              {workspace?.recentSessions.map((session) => (
                <div key={session.serviceSessionId} className={[opsInset, 'p-3 text-right'].join(' ')}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-[#1e1712]">{session.sessionLabel}</div>
                      <div className="mt-1 text-xs text-[#7d6a59]">{session.debtorName ?? 'بدون اسم آجل'} • {formatDateTime(session.paymentCreatedAt)}</div>
                    </div>
                    <div className={opsBadge('accent')}>{formatMoney(session.totalAmount)} ج</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </InsightCard>

        <InsightCard title="آخر حركات الآجل" hint="آخر حركات مرتبطة.">
          {(workspace?.recentLedger ?? []).length === 0 ? (
            <EmptyText text="لا توجد حركات آجل مرتبطة بعد." />
          ) : (
            <div className="space-y-2">
              {workspace?.recentLedger.map((entry) => (
                <div key={entry.id} className={[opsInset, 'p-3 text-right'].join(' ')}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-[#1e1712]">{entry.entryKind === 'debt' ? 'ترحيل' : entry.entryKind === 'repayment' ? 'سداد' : 'تسوية'}</div>
                      <div className="mt-1 text-xs text-[#7d6a59]">{entry.debtorName} • {formatDateTime(entry.createdAt)}</div>
                    </div>
                    <div className={opsBadge(entry.entryKind === 'repayment' ? 'success' : 'warning')}>{formatMoney(entry.amount)} ج</div>
                  </div>
                  {entry.notes ? <div className="mt-2 text-xs leading-6 text-[#6b5a4c]">{entry.notes}</div> : null}
                </div>
              ))}
            </div>
          )}
        </InsightCard>
      </section>
    </MobileShell>
  );
}

function InsightCard({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className={[opsSurface, 'p-4'].join(' ')}>
      <div className="text-right">
        <div className={opsSectionTitle}>{title}</div>
        {hint ? <div className={[opsSectionHint, 'mt-1 hidden lg:block'].join(' ')}>{hint}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function EmptyText({ text }: { text: string }) {
  return <div className={[opsInset, 'p-4 text-center text-sm text-[#7d6a59]'].join(' ')}>{text}</div>;
}

function MetricCard({ label, value, tone }: { label: string; value: string | number; tone: 'accent' | 'success' | 'neutral' | 'info' }) {
  return (
    <div className={opsMetricCard(tone)}>
      <div className="text-xs text-current/80">{label}</div>
      <div className="mt-2 text-2xl font-black">{value}</div>
    </div>
  );
}
