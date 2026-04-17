'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { MobileShell } from '@/ui/MobileShell';
import { AccessDenied } from '@/ui/AccessState';
import { useAuthz } from '@/lib/authz';
import { extractApiErrorMessage } from '@/lib/api/errors';
import type { CustomerProfile } from '@/lib/ops/types';
import {
  opsAccentButton,
  opsAlert,
  opsBadge,
  opsGhostButton,
  opsInput,
  opsInset,
  opsMetricCard,
  opsSectionHint,
  opsSectionTitle,
  opsSurface,
} from '@/ui/ops/premiumStyles';

function formatDateTime(value: string | null) {
  if (!value) return 'غير مسجل بعد';
  return new Date(value).toLocaleString('ar-EG');
}

function emptyForm() {
  return {
    fullName: '',
    phone: '',
    address: '',
    favoriteDrinkLabel: '',
    notes: '',
  };
}

export default function OwnerCustomersPage() {
  const { can } = useAuthz();
  const [items, setItems] = useState<CustomerProfile[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());

  const selectedCustomer = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  async function refresh() {
    setMessage(null);
    const response = await fetch('/api/owner/customers', { cache: 'no-store' });
    const payload = await response.json().catch(() => null);
    if (!payload?.ok) {
      setItems([]);
      setMessage(extractApiErrorMessage(payload, 'CUSTOMERS_LOAD_FAILED'));
      return false;
    }
    setItems(payload.items as CustomerProfile[]);
    return true;
  }

  useEffect(() => {
    if (!can.owner) return;
    void refresh();
  }, [can.owner]);

  function resetForm() {
    setSelectedId(null);
    setForm(emptyForm());
  }

  function startEdit(customer: CustomerProfile) {
    setSelectedId(customer.id);
    setForm({
      fullName: customer.fullName,
      phone: customer.phoneRaw,
      address: customer.address ?? '',
      favoriteDrinkLabel: customer.favoriteDrinkLabel ?? '',
      notes: customer.notes ?? '',
    });
  }

  async function submit() {
    setMessage(null);
    setBusy(true);
    try {
      const response = await fetch(selectedId ? `/api/owner/customers/${selectedId}` : '/api/owner/customers', {
        method: selectedId ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      const payload = await response.json().catch(() => null);
      if (!payload?.ok) {
        setMessage(extractApiErrorMessage(payload, selectedId ? 'CUSTOMER_UPDATE_FAILED' : 'CUSTOMER_CREATE_FAILED'));
        return;
      }
      const refreshed = await refresh();
      if (!refreshed) return;
      resetForm();
      setMessage(selectedId ? 'تم تحديث ملف العميل.' : 'تم إنشاء ملف العميل بنجاح.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(customer: CustomerProfile) {
    setMessage(null);
    setBusy(true);
    try {
      const response = await fetch(`/api/owner/customers/${customer.id}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isActive: !customer.isActive }),
      });
      const payload = await response.json().catch(() => null);
      if (!payload?.ok) {
        setMessage(extractApiErrorMessage(payload, 'CUSTOMER_STATUS_UPDATE_FAILED'));
        return;
      }
      const refreshed = await refresh();
      if (!refreshed) return;
      if (selectedId === customer.id && customer.isActive) {
        setSelectedId(customer.id);
      }
      setMessage(customer.isActive ? 'تم إيقاف ملف العميل.' : 'تمت إعادة تفعيل ملف العميل.');
    } finally {
      setBusy(false);
    }
  }

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? item.isActive : !item.isActive);
      const haystack = [item.fullName, item.phoneRaw, item.address ?? '', item.favoriteDrinkLabel ?? ''].join(' ').toLowerCase();
      return matchesStatus && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
  }, [items, query, statusFilter]);

  if (!can.owner) {
    return <AccessDenied title="ملف العملاء" />;
  }

  const stats = useMemo(() => ({
    total: items.length,
    active: items.filter((item) => item.isActive).length,
    inactive: items.filter((item) => !item.isActive).length,
    withFavorite: items.filter((item) => !!item.favoriteDrinkLabel).length,
  }), [items]);

  return (
    <MobileShell title="ملف العملاء" backHref="/owner">
      <section className={[opsSurface, 'p-4'].join(' ')}>
        <div className="flex items-start justify-between gap-3">
          <div className="text-right">
            <div className={opsSectionTitle}>دليل العملاء</div>
            <div className={[opsSectionHint, 'mt-1'].join(' ')}>
              ملف عميل مستقل عن الجلسات الحالية. الاسم ورقم الهاتف هما أساس التعرف على العميل لاحقًا بدون خلط.
            </div>
          </div>
          <div className={opsBadge('accent')}>خطوة 3</div>
        </div>

        {message ? <div className={[opsAlert(message.includes('تم ') ? 'success' : 'danger'), 'mt-3'].join(' ')}>{message}</div> : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <MetricCard label="إجمالي العملاء" value={stats.total} tone="accent" />
          <MetricCard label="ملفات نشطة" value={stats.active} tone="success" />
          <MetricCard label="ملفات موقوفة" value={stats.inactive} tone="neutral" />
          <MetricCard label="لهم مشروب مفضل" value={stats.withFavorite} tone="info" />
        </div>
      </section>

      <section className={[opsSurface, 'mt-4 p-4'].join(' ')}>
        <div className="flex items-start justify-between gap-3">
          <div className="text-right">
            <div className={opsSectionTitle}>{selectedId ? 'تعديل ملف عميل' : 'إضافة عميل جديد'}</div>
            <div className={[opsSectionHint, 'mt-1'].join(' ')}>
              رقم الهاتف مطلوب لتقليل التكرار. العنوان والمشروب المفضل والملاحظات تظل بيانات مرنة بدون التأثير على التشغيل الحالي.
            </div>
          </div>
          {selectedCustomer ? <div className={opsBadge(selectedCustomer.isActive ? 'success' : 'warning')}>{selectedCustomer.isActive ? 'نشط' : 'موقوف'}</div> : null}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            className={opsInput}
            placeholder="اسم العميل"
            value={form.fullName}
            onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
          />
          <input
            className={opsInput}
            placeholder="رقم الهاتف"
            inputMode="tel"
            value={form.phone}
            onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
          />
          <input
            className={opsInput}
            placeholder="العنوان (اختياري)"
            value={form.address}
            onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
          />
          <input
            className={opsInput}
            placeholder="المشروب المفضل (اختياري)"
            value={form.favoriteDrinkLabel}
            onChange={(event) => setForm((current) => ({ ...current, favoriteDrinkLabel: event.target.value }))}
          />
        </div>

        <textarea
          className={[opsInput, 'mt-3 min-h-24'].join(' ')}
          placeholder="ملاحظات داخلية عن العميل - لا تظهر في التشغيل"
          value={form.notes}
          onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
        />

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {selectedId ? (
            <button type="button" onClick={resetForm} className={opsGhostButton} disabled={busy}>
              إلغاء التعديل
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void submit()}
            className={opsAccentButton}
            disabled={busy || !form.fullName.trim() || !form.phone.trim()}
          >
            {busy ? '...' : selectedId ? 'حفظ التعديلات' : 'إضافة العميل'}
          </button>
        </div>
      </section>

      <section className={[opsSurface, 'mt-4 p-4'].join(' ')}>
        <div className="flex items-start justify-between gap-3">
          <div className="text-right">
            <div className={opsSectionTitle}>الملفات الحالية</div>
            <div className={[opsSectionHint, 'mt-1'].join(' ')}>
              هذه المرحلة تحفظ الملف الأساسي فقط. الربط الذكي بالطلبات والآجل سيتم في الخطوة التالية بدون تعديل الجلسات الحالية.
            </div>
          </div>
          <div className={opsBadge('info')}>{filteredItems.length} نتيجة</div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
          <div className={[opsInset, 'p-3'].join(' ')}>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px]">
              <input
                className={opsInput}
                placeholder="بحث بالاسم أو الهاتف أو المشروب"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <div className="grid grid-cols-3 gap-2">
                <FilterButton label="نشط" active={statusFilter === 'active'} onClick={() => setStatusFilter('active')} />
                <FilterButton label="الكل" active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
                <FilterButton label="موقوف" active={statusFilter === 'inactive'} onClick={() => setStatusFilter('inactive')} />
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {filteredItems.length === 0 ? (
                <div className={[opsInset, 'p-4 text-center text-sm text-[#7d6a59]'].join(' ')}>
                  لا توجد ملفات عملاء مطابقة للبحث الحالي.
                </div>
              ) : (
                filteredItems.map((customer) => (
                  <div key={customer.id} className="rounded-[20px] border border-[#decdb9] bg-[#fffaf4] p-3 text-right shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <div className={opsBadge(customer.isActive ? 'success' : 'warning')}>{customer.isActive ? 'نشط' : 'موقوف'}</div>
                          <div className="truncate text-base font-bold text-[#1e1712]">{customer.fullName}</div>
                        </div>
                        <div className="mt-1 text-sm text-[#6b5a4c]">{customer.phoneRaw}</div>
                        <div className="mt-2 flex flex-wrap justify-end gap-2 text-xs text-[#7d6a59]">
                          {customer.favoriteDrinkLabel ? <span className={opsBadge('accent')}>المفضل: {customer.favoriteDrinkLabel}</span> : null}
                          {customer.address ? <span className={opsBadge('neutral')}>العنوان محفوظ</span> : null}
                        </div>
                      </div>
                      <div className="text-left text-xs text-[#7d6a59]">
                        <div>آخر تعديل</div>
                        <div className="mt-1 font-semibold text-[#5e4d3f]">{formatDateTime(customer.updatedAt)}</div>
                      </div>
                    </div>

                    {customer.notes ? <div className="mt-3 text-sm leading-6 text-[#5e4d3f]">{customer.notes}</div> : null}

                    <div className="mt-3 grid gap-2 sm:grid-cols-4">
                      <button type="button" className={opsGhostButton} onClick={() => startEdit(customer)} disabled={busy}>
                        تعديل
                      </button>
                      <Link href={`/owner/customers/${encodeURIComponent(customer.id)}`} className={opsGhostButton}>
                        التفاصيل الذكية
                      </Link>
                      <button
                        type="button"
                        className={opsGhostButton}
                        onClick={() => void toggleActive(customer)}
                        disabled={busy}
                      >
                        {customer.isActive ? 'إيقاف الملف' : 'إعادة التفعيل'}
                      </button>
                      <div className={[opsInset, 'px-3 py-2 text-xs text-[#6b5a4c]'].join(' ')}>
                        آخر ظهور: {formatDateTime(customer.lastSeenAt)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className={[opsInset, 'p-3'].join(' ')}>
            <div className={opsSectionTitle}>سياسة هذه المرحلة</div>
            <ul className="mt-3 space-y-2 text-right text-sm leading-6 text-[#6b5a4c]">
              <li>• لا يتم تعديل الجلسات الحالية أو طريقة الفوترة.</li>
              <li>• الهاتف هو المعرف الأقوى لمنع التكرار.</li>
              <li>• لا يوجد دمج تلقائي بين العملاء في هذه المرحلة.</li>
              <li>• الحقول الحالية تبني أساس الخطوة 4 للربط الذكي لاحقًا.</li>
            </ul>
          </div>
        </div>
      </section>
    </MobileShell>
  );
}

function FilterButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active ? opsAccentButton : opsGhostButton}
    >
      {label}
    </button>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone: 'accent' | 'success' | 'neutral' | 'info' }) {
  return (
    <div className={opsMetricCard(tone)}>
      <div className="text-xs text-current/80">{label}</div>
      <div className="mt-2 text-2xl font-black">{value}</div>
    </div>
  );
}
