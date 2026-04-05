'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MobileShell } from '@/ui/MobileShell';
import { useAuthz } from '@/lib/authz';
import { opsClient } from '@/lib/ops/client';
import type { BillingExtrasSettings, MenuWorkspace, OpsProduct, OpsSection, StationCode } from '@/lib/ops/types';
import { useOpsCommand, useOpsWorkspace } from '@/lib/ops/hooks';
import { AccessDenied } from '@/ui/AccessState';

const stationOptions: Array<{ value: StationCode; label: string }> = [
  { value: 'barista', label: 'باريستا' },
  { value: 'shisha', label: 'شيشة' },
];

function formatMoney(value: number) {
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(value ?? 0);
}

function moveInList<T extends { id: string }>(items: T[], itemId: string, delta: -1 | 1) {
  const currentIndex = items.findIndex((item) => item.id === itemId);
  if (currentIndex < 0) return items;
  const nextIndex = currentIndex + delta;
  if (nextIndex < 0 || nextIndex >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(currentIndex, 1);
  if (!moved) return items;
  next.splice(nextIndex, 0, moved);
  return next;
}

export default function MenuPage() {
  const { can } = useAuthz();
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localNotice, setLocalNotice] = useState<string | null>(null);
  const [editingSectionId, setEditingSectionId] = useState('');
  const [editingProductId, setEditingProductId] = useState('');
  const [sectionForm, setSectionForm] = useState({ title: '', stationCode: 'barista' as StationCode });
  const [productForm, setProductForm] = useState({
    sectionId: '',
    productName: '',
    stationCode: 'barista' as StationCode,
    unitPrice: '',
  });
  const [sectionEditForm, setSectionEditForm] = useState({ title: '', stationCode: 'barista' as StationCode });
  const [productEditForm, setProductEditForm] = useState({
    sectionId: '',
    productName: '',
    stationCode: 'barista' as StationCode,
    unitPrice: '',
  });
  const [billingSettingsForm, setBillingSettingsForm] = useState<BillingExtrasSettings>({
    taxEnabled: false,
    taxRate: 0,
    serviceEnabled: false,
    serviceRate: 0,
  });

  const loader = useCallback(() => opsClient.menuWorkspace(), []);
  const { data, error, setData } = useOpsWorkspace<MenuWorkspace>(loader, {
    enabled: can.manageMenu,
    cacheKey: 'workspace:menu',
    staleTimeMs: 60_000,
  });

  useEffect(() => {
    if (data?.billingSettings) {
      setBillingSettingsForm(data.billingSettings);
    }
  }, [data?.billingSettings]);

  const activeSections = useMemo(() => (data?.sections ?? []).filter((section) => section.isActive !== false), [data?.sections]);

  const visibleSections = useMemo(
    () => (showArchived ? (data?.sections ?? []) : activeSections),
    [activeSections, data?.sections, showArchived],
  );

  const effectiveSelectedSectionId = useMemo(() => {
    const sectionIds = new Set((data?.sections ?? []).map((section) => section.id));
    if (selectedSectionId && sectionIds.has(selectedSectionId)) return selectedSectionId;
    return visibleSections[0]?.id ?? data?.sections?.[0]?.id ?? '';
  }, [data?.sections, selectedSectionId, visibleSections]);

  const effectiveProductFormSectionId = productForm.sectionId || activeSections[0]?.id || '';

  const selectedSection = useMemo(
    () => (data?.sections ?? []).find((section) => section.id === effectiveSelectedSectionId) ?? null,
    [data?.sections, effectiveSelectedSectionId],
  );

  const filteredProducts = useMemo(() => {
    if (!effectiveSelectedSectionId) return data?.products ?? [];
    return (data?.products ?? []).filter((product) => {
      if (product.sectionId !== effectiveSelectedSectionId) return false;
      if (!showArchived && product.isActive === false) return false;
      return true;
    });
  }, [data?.products, effectiveSelectedSectionId, showArchived]);

  const completeAction = useCallback(
    async (notice?: string) => {
      setLocalError(null);
      if (notice) setLocalNotice(notice);
    },
    [],
  );

  const createSection = useOpsCommand(
    async () => {
      const title = sectionForm.title.trim();
      if (!title) return;
      await opsClient.createMenuSection({ title, stationCode: sectionForm.stationCode });
      setSectionForm({ title: '', stationCode: sectionForm.stationCode });
      await completeAction('تمت إضافة القسم بنجاح.');
    },
    { onError: setLocalError },
  );

  const updateSection = useOpsCommand(
    async () => {
      const title = sectionEditForm.title.trim();
      if (!editingSectionId || !title) return;
      await opsClient.updateMenuSection({
        sectionId: editingSectionId,
        title,
        stationCode: sectionEditForm.stationCode,
      });
      setEditingSectionId('');
      await completeAction('تم تحديث بيانات القسم.');
    },
    { onError: setLocalError },
  );

  const createProduct = useOpsCommand(
    async () => {
      const unitPrice = Number(productForm.unitPrice);
      if (!effectiveProductFormSectionId || !productForm.productName.trim() || !Number.isFinite(unitPrice) || unitPrice < 0) {
        return;
      }
      await opsClient.createMenuProduct({
        sectionId: effectiveProductFormSectionId,
        productName: productForm.productName.trim(),
        stationCode: productForm.stationCode,
        unitPrice,
      });
      setProductForm((current) => ({ ...current, productName: '', unitPrice: '', sectionId: current.sectionId || effectiveSelectedSectionId }));
      await completeAction('تمت إضافة الصنف بنجاح.');
    },
    { onError: setLocalError },
  );

  const updateProduct = useOpsCommand(
    async () => {
      const unitPrice = Number(productEditForm.unitPrice);
      if (!editingProductId || !productEditForm.sectionId || !productEditForm.productName.trim() || !Number.isFinite(unitPrice) || unitPrice < 0) {
        return;
      }
      await opsClient.updateMenuProduct({
        productId: editingProductId,
        sectionId: productEditForm.sectionId,
        productName: productEditForm.productName.trim(),
        stationCode: productEditForm.stationCode,
        unitPrice,
      });
      setEditingProductId('');
      await completeAction('تم تحديث بيانات الصنف.');
    },
    { onError: setLocalError },
  );

  const saveBillingSettings = useOpsCommand(
    async () => {
      const payload = {
        taxEnabled: billingSettingsForm.taxEnabled,
        taxRate: Math.min(Math.max(Number(billingSettingsForm.taxRate ?? 0), 0), 100),
        serviceEnabled: billingSettingsForm.serviceEnabled,
        serviceRate: Math.min(Math.max(Number(billingSettingsForm.serviceRate ?? 0), 0), 100),
      } satisfies BillingExtrasSettings;

      const result = await opsClient.saveBillingSettings(payload);
      setBillingSettingsForm(result.settings);
      setData((current) => current ? { ...current, billingSettings: result.settings } : current);
      await completeAction('تم حفظ إعدادات الضريبة والخدمة بنجاح.');
    },
    { onError: setLocalError },
  );

  const toggleSection = useOpsCommand(
    async (sectionId: string, isActive: boolean) => {
      await opsClient.toggleMenuSection(sectionId, isActive);
      await completeAction(isActive ? 'تم تفعيل القسم.' : 'تم تعطيل القسم.');
    },
    { onError: setLocalError },
  );

  const deleteSection = useOpsCommand(
    async (sectionId: string) => {
      const result = await opsClient.deleteMenuSection(sectionId);
      setEditingSectionId('');
      await completeAction(result.mode === 'archived' ? 'القسم مستخدم سابقًا، لذلك تم أرشفته مع أصنافه.' : 'تم حذف القسم.');
    },
    { onError: setLocalError },
  );

  const reorderSections = useOpsCommand(
    async (sectionIds: string[]) => {
      await opsClient.reorderMenuSections(sectionIds);
      await completeAction('تم تحديث ترتيب الأقسام.');
    },
    { onError: setLocalError },
  );

  const toggleProduct = useOpsCommand(
    async (productId: string, isActive: boolean) => {
      await opsClient.toggleMenuProduct(productId, isActive);
      await completeAction(isActive ? 'تم تفعيل الصنف.' : 'تم تعطيل الصنف.');
    },
    { onError: setLocalError },
  );

  const deleteProduct = useOpsCommand(
    async (productId: string) => {
      const result = await opsClient.deleteMenuProduct(productId);
      setEditingProductId('');
      await completeAction(result.mode === 'archived' ? 'الصنف مستخدم سابقًا، لذلك تم أرشفته.' : 'تم حذف الصنف.');
    },
    { onError: setLocalError },
  );

  const reorderProducts = useOpsCommand(
    async (sectionId: string, productIds: string[]) => {
      await opsClient.reorderMenuProducts(sectionId, productIds);
      await completeAction('تم تحديث ترتيب الأصناف.');
    },
    { onError: setLocalError },
  );

  const beginSectionEdit = useCallback((section: OpsSection) => {
    setEditingSectionId(section.id);
    setSectionEditForm({ title: section.title, stationCode: section.stationCode });
    setLocalNotice(null);
  }, []);

  const beginProductEdit = useCallback((product: OpsProduct) => {
    setEditingProductId(product.id);
    setProductEditForm({
      sectionId: product.sectionId,
      productName: product.name,
      stationCode: product.stationCode,
      unitPrice: String(product.unitPrice),
    });
    setLocalNotice(null);
  }, []);

  const moveSection = useCallback(
    async (sectionId: string, delta: -1 | 1) => {
      const ordered = moveInList(data?.sections ?? [], sectionId, delta).map((section) => section.id);
      if (ordered.length) await reorderSections.run(ordered);
    },
    [data?.sections, reorderSections],
  );

  const moveProduct = useCallback(
    async (productId: string, delta: -1 | 1) => {
      if (!effectiveSelectedSectionId) return;
      const ordered = moveInList(filteredProducts, productId, delta).map((product) => product.id);
      if (ordered.length) await reorderProducts.run(effectiveSelectedSectionId, ordered);
    },
    [effectiveSelectedSectionId, filteredProducts, reorderProducts],
  );

  const confirmSectionDelete = useCallback(
    async (section: OpsSection) => {
      if (!window.confirm(`حذف أو أرشفة القسم "${section.title}"؟`)) return;
      await deleteSection.run(section.id);
    },
    [deleteSection],
  );

  const confirmProductDelete = useCallback(
    async (product: OpsProduct) => {
      if (!window.confirm(`حذف أو أرشفة الصنف "${product.name}"؟`)) return;
      await deleteProduct.run(product.id);
    },
    [deleteProduct],
  );

  if (!can.manageMenu) {
    return <AccessDenied title="المنيو" />;
  }

  const effectiveError = localError ?? error;
  const busy = [
    createSection.busy,
    updateSection.busy,
    createProduct.busy,
    updateProduct.busy,
    saveBillingSettings.busy,
    toggleSection.busy,
    deleteSection.busy,
    reorderSections.busy,
    toggleProduct.busy,
    deleteProduct.busy,
    reorderProducts.busy,
  ].some(Boolean);

  return (
    <MobileShell title="المنيو" backHref="/owner">
      <section className="mb-3 ahwa-card p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold">تصدير المنيو</div>
            <div className="mt-1 text-xs text-[#8a7763]">افتح نسخة قابلة للطباعة واحفظها PDF أو اطبعها مباشرة.</div>
          </div>
          <Link href="/menu/print" className="rounded-2xl border bg-[#fffdf9] px-4 py-2 text-sm font-semibold text-[#5e4d3f]">تصدير PDF</Link>
        </div>
      </section>

      {effectiveError ? (
        <div className="mb-3 ahwa-alert-danger p-3 text-sm">
          {effectiveError}
        </div>
      ) : null}

      {localNotice ? (
        <div className="mb-3 rounded-2xl border border-[#cfe0d7] bg-[#eff7f1] p-3 text-sm text-[#2e6a4e]">
          {localNotice}
        </div>
      ) : null}

      <div className="space-y-3">
        <section className="rounded-2xl border border-[#decdb9] bg-[#fffdf9] p-3 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-[#2f241b]">إعدادات الضريبة والخدمة</div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-[#decdb9] bg-[#f8f1e7] p-3">
              <label className="flex items-center justify-between gap-3 text-sm font-semibold text-[#2f241b]">
                <span>تفعيل الضريبة</span>
                <input type="checkbox" checked={billingSettingsForm.taxEnabled} onChange={(event) => setBillingSettingsForm((current) => ({ ...current, taxEnabled: event.target.checked }))} />
              </label>
              <input
                value={String(billingSettingsForm.taxRate)}
                onChange={(event) => setBillingSettingsForm((current) => ({ ...current, taxRate: Number(event.target.value || 0) }))}
                placeholder="مثال 14"
                inputMode="decimal"
                className="mt-3 w-full rounded-2xl border border-[#decdb9] bg-[#fffdf9] px-3 py-3 text-right text-sm outline-none"
              />
              <div className="mt-2 text-xs text-[#8a7763]">النسبة المئوية للضريبة. مثال: 14 يعني 14%.</div>
            </div>

            <div className="rounded-2xl border border-[#decdb9] bg-[#f8f1e7] p-3">
              <label className="flex items-center justify-between gap-3 text-sm font-semibold text-[#2f241b]">
                <span>تفعيل الخدمة</span>
                <input type="checkbox" checked={billingSettingsForm.serviceEnabled} onChange={(event) => setBillingSettingsForm((current) => ({ ...current, serviceEnabled: event.target.checked }))} />
              </label>
              <input
                value={String(billingSettingsForm.serviceRate)}
                onChange={(event) => setBillingSettingsForm((current) => ({ ...current, serviceRate: Number(event.target.value || 0) }))}
                placeholder="مثال 12"
                inputMode="decimal"
                className="mt-3 w-full rounded-2xl border border-[#decdb9] bg-[#fffdf9] px-3 py-3 text-right text-sm outline-none"
              />
              <div className="mt-2 text-xs text-[#8a7763]">النسبة المئوية للخدمة على الفاتورة الواحدة.</div>
            </div>
          </div>
          <button onClick={() => void saveBillingSettings.run()} disabled={busy} className="mt-3 w-full rounded-2xl bg-[#1e1712] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">حفظ إعدادات الفاتورة</button>
        </section>

        <section className="rounded-2xl border border-[#decdb9] bg-[#fffdf9] p-3 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-[#2f241b]">إضافة قسم</div>
          <div className="space-y-2">
            <input
              value={sectionForm.title}
              onChange={(event) => setSectionForm((current) => ({ ...current, title: event.target.value }))}
              className="w-full rounded-2xl border border-[#decdb9] bg-[#fffdf9] px-3 py-3 text-right text-sm outline-none"
              placeholder="اسم القسم"
            />
            <select
              value={sectionForm.stationCode}
              onChange={(event) => setSectionForm((current) => ({ ...current, stationCode: event.target.value as StationCode }))}
              className="w-full rounded-2xl border border-[#decdb9] bg-[#fffdf9] px-3 py-3 text-right text-sm outline-none"
            >
              {stationOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => void createSection.run()}
              disabled={busy}
              className="w-full rounded-2xl bg-[#9b6b2e] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              إضافة القسم
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-[#decdb9] bg-[#fffdf9] p-3 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-[#2f241b]">إضافة صنف</div>
          <div className="space-y-2">
            <select
              value={effectiveProductFormSectionId}
              onChange={(event) => setProductForm((current) => ({ ...current, sectionId: event.target.value }))}
              className="w-full rounded-2xl border border-[#decdb9] bg-[#fffdf9] px-3 py-3 text-right text-sm outline-none"
            >
              {activeSections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.title}
                </option>
              ))}
            </select>
            <input
              value={productForm.productName}
              onChange={(event) => setProductForm((current) => ({ ...current, productName: event.target.value }))}
              className="w-full rounded-2xl border border-[#decdb9] bg-[#fffdf9] px-3 py-3 text-right text-sm outline-none"
              placeholder="اسم الصنف"
            />
            <select
              value={productForm.stationCode}
              onChange={(event) => setProductForm((current) => ({ ...current, stationCode: event.target.value as StationCode }))}
              className="w-full rounded-2xl border border-[#decdb9] bg-[#fffdf9] px-3 py-3 text-right text-sm outline-none"
            >
              {stationOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              value={productForm.unitPrice}
              onChange={(event) => setProductForm((current) => ({ ...current, unitPrice: event.target.value }))}
              className="w-full rounded-2xl border border-[#decdb9] bg-[#fffdf9] px-3 py-3 text-right text-sm outline-none"
              placeholder="السعر"
              inputMode="decimal"
            />
            <button
              onClick={() => void createProduct.run()}
              disabled={busy || !activeSections.length}
              className="w-full rounded-2xl bg-[#2e6a4e] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              إضافة الصنف
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-[#decdb9] bg-[#fffdf9] p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="text-xs text-[#8a7763]">القائمة اليومية تُظهر الأقسام والأصناف النشطة فقط. عند الحاجة يمكنك إظهار المؤرشفات مؤقتًا للمراجعة.</div>
            <label className="flex items-center gap-2 rounded-full border border-[#decdb9] bg-[#f8f1e7] px-3 py-2 text-xs font-semibold text-[#5e4d3f]">
              <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
              إظهار المؤرشف/المعطل
            </label>
          </div>

          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
            {visibleSections.map((section) => (
              <button
                key={section.id}
                onClick={() => setSelectedSectionId(section.id)}
                className={[
                  'whitespace-nowrap rounded-2xl px-3 py-2 text-sm font-semibold',
                  effectiveSelectedSectionId === section.id ? 'bg-[#1e1712] text-white' : 'border border-[#decdb9] bg-[#f8f1e7] text-[#2f241b]',
                  section.isActive === false ? 'opacity-60' : '',
                ].join(' ')}
              >
                {section.title}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {visibleSections.map((section, sectionIndex) => (
              <div key={section.id} className="rounded-2xl border border-[#decdb9] bg-[#f8f1e7] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-right">
                    <div className="font-semibold text-[#1e1712]">{section.title}</div>
                    <div className="text-xs text-[#8a7763]">
                      {stationOptions.find((option) => option.value === section.stationCode)?.label ?? section.stationCode}
                      {section.isActive === false ? ' • مؤرشف/معطل' : ''}
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2 text-xs">
                    <button onClick={() => void moveSection(section.id, -1)} disabled={busy || sectionIndex === 0} className="rounded-2xl border border-[#decdb9] bg-[#fffdf9] px-3 py-2 disabled:opacity-50">↑</button>
                    <button onClick={() => void moveSection(section.id, 1)} disabled={busy || sectionIndex === visibleSections.length - 1} className="rounded-2xl border border-[#decdb9] bg-[#fffdf9] px-3 py-2 disabled:opacity-50">↓</button>
                    <button onClick={() => beginSectionEdit(section)} disabled={busy} className="rounded-2xl border border-[#decdb9] bg-[#fffdf9] px-3 py-2">تعديل</button>
                    <button onClick={() => void toggleSection.run(section.id, !section.isActive)} disabled={busy} className={['rounded-2xl px-3 py-2 font-semibold', section.isActive ? 'border border-[#ecd9bd] bg-[#fffdf9] text-[#a5671e]' : 'bg-[#2e6a4e] text-white'].join(' ')}>{section.isActive ? 'تعطيل' : 'تفعيل'}</button>
                    <button onClick={() => void confirmSectionDelete(section)} disabled={busy} className="rounded-2xl border border-[#e6c7c2] bg-[#fffdf9] px-3 py-2 text-[#9a3e35]">حذف/أرشفة</button>
                  </div>
                </div>

                {editingSectionId === section.id ? (
                  <div className="mt-3 space-y-2 border-t border-[#decdb9] pt-3">
                    <input value={sectionEditForm.title} onChange={(event) => setSectionEditForm((current) => ({ ...current, title: event.target.value }))} className="w-full rounded-2xl border border-[#decdb9] bg-[#fffdf9] px-3 py-3 text-right text-sm outline-none" placeholder="اسم القسم" />
                    <select value={sectionEditForm.stationCode} onChange={(event) => setSectionEditForm((current) => ({ ...current, stationCode: event.target.value as StationCode }))} className="w-full rounded-2xl border border-[#decdb9] bg-[#fffdf9] px-3 py-3 text-right text-sm outline-none">
                      {stationOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <button onClick={() => void updateSection.run()} disabled={busy} className="flex-1 rounded-2xl bg-[#1e1712] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">حفظ التعديل</button>
                      <button onClick={() => setEditingSectionId('')} disabled={busy} className="flex-1 rounded-2xl border border-[#decdb9] bg-[#fffdf9] px-4 py-3 text-sm font-semibold text-[#5e4d3f] disabled:opacity-60">إلغاء</button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-[#decdb9] bg-[#fffdf9] p-3 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-[#2f241b]">{selectedSection ? `أصناف قسم ${selectedSection.title}` : 'أصناف القسم'}</div>
          <div className="space-y-2">
            {filteredProducts.map((product, productIndex) => (
              <div key={product.id} className="rounded-2xl border border-[#decdb9] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-right">
                    <div className="font-semibold text-[#1e1712]">{product.name}</div>
                    <div className="text-xs text-[#8a7763]">
                      {stationOptions.find((option) => option.value === product.stationCode)?.label ?? product.stationCode} {' • '} {formatMoney(product.unitPrice)} ج {product.isActive === false ? ' • مؤرشف/معطل' : ''}
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2 text-xs">
                    <button onClick={() => void moveProduct(product.id, -1)} disabled={busy || productIndex === 0} className="rounded-2xl border border-[#decdb9] bg-[#fffdf9] px-3 py-2 disabled:opacity-50">↑</button>
                    <button onClick={() => void moveProduct(product.id, 1)} disabled={busy || productIndex === filteredProducts.length - 1} className="rounded-2xl border border-[#decdb9] bg-[#fffdf9] px-3 py-2 disabled:opacity-50">↓</button>
                    <button onClick={() => beginProductEdit(product)} disabled={busy} className="rounded-2xl border border-[#decdb9] bg-[#fffdf9] px-3 py-2">تعديل</button>
                    <button onClick={() => void toggleProduct.run(product.id, !product.isActive)} disabled={busy} className={['rounded-2xl px-3 py-2 font-semibold', product.isActive ? 'border border-[#ecd9bd] bg-[#fffdf9] text-[#a5671e]' : 'bg-[#2e6a4e] text-white'].join(' ')}>{product.isActive ? 'تعطيل' : 'تفعيل'}</button>
                    <button onClick={() => void confirmProductDelete(product)} disabled={busy} className="rounded-2xl border border-[#e6c7c2] bg-[#fffdf9] px-3 py-2 text-[#9a3e35]">حذف/أرشفة</button>
                  </div>
                </div>

                {editingProductId === product.id ? (
                  <div className="mt-3 space-y-2 border-t border-[#decdb9] pt-3">
                    <select value={productEditForm.sectionId} onChange={(event) => setProductEditForm((current) => ({ ...current, sectionId: event.target.value }))} className="w-full rounded-2xl border border-[#decdb9] bg-[#fffdf9] px-3 py-3 text-right text-sm outline-none">
                      {(data?.sections ?? []).map((section) => (
                        <option key={section.id} value={section.id}>{section.title}</option>
                      ))}
                    </select>
                    <input value={productEditForm.productName} onChange={(event) => setProductEditForm((current) => ({ ...current, productName: event.target.value }))} className="w-full rounded-2xl border border-[#decdb9] bg-[#fffdf9] px-3 py-3 text-right text-sm outline-none" placeholder="اسم الصنف" />
                    <select value={productEditForm.stationCode} onChange={(event) => setProductEditForm((current) => ({ ...current, stationCode: event.target.value as StationCode }))} className="w-full rounded-2xl border border-[#decdb9] bg-[#fffdf9] px-3 py-3 text-right text-sm outline-none">
                      {stationOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <input value={productEditForm.unitPrice} onChange={(event) => setProductEditForm((current) => ({ ...current, unitPrice: event.target.value }))} className="w-full rounded-2xl border border-[#decdb9] bg-[#fffdf9] px-3 py-3 text-right text-sm outline-none" placeholder="السعر" inputMode="decimal" />
                    <div className="flex gap-2">
                      <button onClick={() => void updateProduct.run()} disabled={busy} className="flex-1 rounded-2xl bg-[#1e1712] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">حفظ التعديل</button>
                      <button onClick={() => setEditingProductId('')} disabled={busy} className="flex-1 rounded-2xl border border-[#decdb9] bg-[#fffdf9] px-4 py-3 text-sm font-semibold text-[#5e4d3f] disabled:opacity-60">إلغاء</button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}

            {!filteredProducts.length ? (
              <div className="rounded-2xl border border-dashed border-[#d7c7b2] p-4 text-center text-sm text-[#8a7763]">
                {showArchived ? 'لا توجد أصناف في هذا القسم حتى مع إظهار المؤرشفات.' : 'لا توجد أصناف نشطة في هذا القسم بعد.'}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </MobileShell>
  );
}
