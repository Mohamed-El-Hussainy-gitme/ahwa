'use client';

import { useEffect, useMemo, useState } from 'react';
import { MobileShell } from '@/ui/MobileShell';
import { AccessDenied } from '@/ui/AccessState';
import { useAuthz } from '@/lib/authz';
import { extractApiErrorMessage } from '@/lib/api/errors';
import type {
  InventoryAddonRecipe,
  InventoryEstimatedConsumptionItem,
  InventoryItem,
  InventoryMovement,
  InventoryProductRecipe,
  InventorySupplier,
  InventoryWorkspace,
} from '@/lib/ops/types';
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
  opsSelect,
  opsSurface,
} from '@/ui/ops/premiumStyles';

function emptyItemForm() {
  return {
    itemName: '',
    itemCode: '',
    categoryLabel: '',
    unitLabel: 'قطعة',
    lowStockThreshold: '',
    openingBalance: '',
    notes: '',
  };
}

function emptySupplierForm() {
  return {
    supplierName: '',
    phone: '',
    notes: '',
  };
}

function emptyMovementForm(itemId = '') {
  return {
    inventoryItemId: itemId,
    movementKind: 'inbound' as InventoryMovement['movementKind'],
    quantity: '',
    adjustmentDirection: 'increase' as 'increase' | 'decrease',
    supplierId: '',
    notes: '',
  };
}

function emptyProductRecipeForm() {
  return {
    menuProductId: '',
    inventoryItemId: '',
    quantityPerUnit: '',
    wastagePercent: '',
    notes: '',
  };
}

function emptyAddonRecipeForm() {
  return {
    menuAddonId: '',
    inventoryItemId: '',
    quantityPerUnit: '',
    wastagePercent: '',
    notes: '',
  };
}

function emptyWorkspace(): InventoryWorkspace {
  return {
    items: [],
    suppliers: [],
    recentMovements: [],
    menuProducts: [],
    menuAddons: [],
    productRecipes: [],
    addonRecipes: [],
    estimatedConsumption: [],
    analysisWindowDays: 30,
  };
}

function formatDateTime(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('ar-EG');
}

function formatQty(value: number) {
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 3 }).format(value);
}

function stockTone(status: InventoryItem['stockStatus']) {
  switch (status) {
    case 'empty':
      return 'danger';
    case 'low':
      return 'warning';
    case 'inactive':
      return 'neutral';
    default:
      return 'success';
  }
}

function stockLabel(status: InventoryItem['stockStatus']) {
  switch (status) {
    case 'empty':
      return 'نفدت';
    case 'low':
      return 'منخفضة';
    case 'inactive':
      return 'موقوفة';
    default:
      return 'جيدة';
  }
}

function movementLabel(kind: InventoryMovement['movementKind']) {
  switch (kind) {
    case 'outbound':
      return 'صرف';
    case 'waste':
      return 'هالك';
    case 'adjustment':
      return 'تسوية';
    default:
      return 'وارد';
  }
}

function movementTone(kind: InventoryMovement['movementKind']) {
  switch (kind) {
    case 'outbound':
      return 'info';
    case 'waste':
      return 'danger';
    case 'adjustment':
      return 'warning';
    default:
      return 'success';
  }
}

function coverageTone(row: InventoryEstimatedConsumptionItem) {
  if (row.stockStatus === 'empty') return 'danger';
  if (row.coverageDays !== null && row.coverageDays <= 3) return 'danger';
  if (row.stockStatus === 'low' || (row.coverageDays !== null && row.coverageDays <= 7)) return 'warning';
  return 'success';
}

function coverageLabel(row: InventoryEstimatedConsumptionItem) {
  if (row.coverageDays === null) return 'غير محسوب';
  return `${formatQty(row.coverageDays)} يوم`;
}

function recipeTone(isActive: boolean) {
  return isActive ? 'accent' : 'neutral';
}

export default function InventoryPage() {
  const { can } = useAuthz();
  const [workspace, setWorkspace] = useState<InventoryWorkspace>(emptyWorkspace());
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'active' | 'low' | 'empty' | 'inactive'>('active');
  const [itemId, setItemId] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [productRecipeId, setProductRecipeId] = useState<string | null>(null);
  const [addonRecipeId, setAddonRecipeId] = useState<string | null>(null);
  const [recipeScope, setRecipeScope] = useState<'product' | 'addon'>('product');
  const [itemForm, setItemForm] = useState(emptyItemForm());
  const [supplierForm, setSupplierForm] = useState(emptySupplierForm());
  const [movementForm, setMovementForm] = useState(emptyMovementForm());
  const [productRecipeForm, setProductRecipeForm] = useState(emptyProductRecipeForm());
  const [addonRecipeForm, setAddonRecipeForm] = useState(emptyAddonRecipeForm());

  async function refresh() {
    setMessage(null);
    const response = await fetch('/api/owner/inventory/workspace', { cache: 'no-store' });
    const payload = await response.json().catch(() => null);
    if (!payload?.ok) {
      setWorkspace(emptyWorkspace());
      setMessage(extractApiErrorMessage(payload, 'INVENTORY_WORKSPACE_FAILED'));
      return false;
    }
    const nextWorkspace = payload.workspace as InventoryWorkspace;
    setWorkspace(nextWorkspace);
    setMovementForm((current) => {
      if (current.inventoryItemId && nextWorkspace.items.some((item) => item.id === current.inventoryItemId)) {
        return current;
      }
      const firstActive = nextWorkspace.items.find((item) => item.isActive);
      return emptyMovementForm(firstActive?.id ?? '');
    });
    return true;
  }

  useEffect(() => {
    if (!can.owner) return;
    void refresh();
  }, [can.owner]);

  const selectedItem = useMemo(
    () => workspace.items.find((item) => item.id === itemId) ?? null,
    [workspace.items, itemId],
  );

  const selectedSupplier = useMemo(
    () => workspace.suppliers.find((item) => item.id === supplierId) ?? null,
    [workspace.suppliers, supplierId],
  );

  const selectedProductRecipe = useMemo(
    () => workspace.productRecipes.find((item) => item.id === productRecipeId) ?? null,
    [workspace.productRecipes, productRecipeId],
  );

  const selectedAddonRecipe = useMemo(
    () => workspace.addonRecipes.find((item) => item.id === addonRecipeId) ?? null,
    [workspace.addonRecipes, addonRecipeId],
  );

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return workspace.items.filter((item) => {
      const matchesFilter = stockFilter === 'all'
        ? true
        : stockFilter === 'active'
          ? item.isActive
          : stockFilter === 'inactive'
            ? !item.isActive
            : item.stockStatus === stockFilter;
      const haystack = [item.itemName, item.itemCode ?? '', item.categoryLabel ?? '', item.unitLabel].join(' ').toLowerCase();
      return matchesFilter && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
  }, [workspace.items, query, stockFilter]);

  const filteredEstimatedConsumption = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return workspace.estimatedConsumption.filter((item) => {
      if (!normalizedQuery) return true;
      return [item.itemName, item.unitLabel].join(' ').toLowerCase().includes(normalizedQuery);
    });
  }, [workspace.estimatedConsumption, query]);

  const stats = useMemo(() => ({
    totalItems: workspace.items.length,
    lowStock: workspace.items.filter((item) => item.stockStatus === 'low').length,
    emptyStock: workspace.items.filter((item) => item.stockStatus === 'empty').length,
    suppliers: workspace.suppliers.filter((supplier) => supplier.isActive).length,
    productRecipes: workspace.productRecipes.filter((recipe) => recipe.isActive).length,
    addonRecipes: workspace.addonRecipes.filter((recipe) => recipe.isActive).length,
    criticalConsumption: workspace.estimatedConsumption.filter((row) => row.stockStatus === 'empty' || row.stockStatus === 'low' || (row.coverageDays !== null && row.coverageDays <= 3)).length,
  }), [workspace]);

  function resetItemForm() {
    setItemId(null);
    setItemForm(emptyItemForm());
  }

  function resetSupplierForm() {
    setSupplierId(null);
    setSupplierForm(emptySupplierForm());
  }

  function resetProductRecipeForm() {
    setProductRecipeId(null);
    setProductRecipeForm(emptyProductRecipeForm());
  }

  function resetAddonRecipeForm() {
    setAddonRecipeId(null);
    setAddonRecipeForm(emptyAddonRecipeForm());
  }

  function startEditItem(item: InventoryItem) {
    setItemId(item.id);
    setItemForm({
      itemName: item.itemName,
      itemCode: item.itemCode ?? '',
      categoryLabel: item.categoryLabel ?? '',
      unitLabel: item.unitLabel,
      lowStockThreshold: item.lowStockThreshold > 0 ? String(item.lowStockThreshold) : '',
      openingBalance: '',
      notes: item.notes ?? '',
    });
  }

  function startEditSupplier(supplier: InventorySupplier) {
    setSupplierId(supplier.id);
    setSupplierForm({
      supplierName: supplier.supplierName,
      phone: supplier.phone ?? '',
      notes: supplier.notes ?? '',
    });
  }

  function startEditProductRecipe(recipe: InventoryProductRecipe) {
    setRecipeScope('product');
    setProductRecipeId(recipe.id);
    setProductRecipeForm({
      menuProductId: recipe.menuProductId,
      inventoryItemId: recipe.inventoryItemId,
      quantityPerUnit: String(recipe.quantityPerUnit),
      wastagePercent: recipe.wastagePercent > 0 ? String(recipe.wastagePercent) : '',
      notes: recipe.notes ?? '',
    });
  }

  function startEditAddonRecipe(recipe: InventoryAddonRecipe) {
    setRecipeScope('addon');
    setAddonRecipeId(recipe.id);
    setAddonRecipeForm({
      menuAddonId: recipe.menuAddonId,
      inventoryItemId: recipe.inventoryItemId,
      quantityPerUnit: String(recipe.quantityPerUnit),
      wastagePercent: recipe.wastagePercent > 0 ? String(recipe.wastagePercent) : '',
      notes: recipe.notes ?? '',
    });
  }

  async function submitItem() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(itemId ? `/api/owner/inventory/items/${itemId}` : '/api/owner/inventory/items', {
        method: itemId ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          itemName: itemForm.itemName,
          itemCode: itemForm.itemCode,
          categoryLabel: itemForm.categoryLabel,
          unitLabel: itemForm.unitLabel,
          lowStockThreshold: itemForm.lowStockThreshold || 0,
          openingBalance: itemId ? undefined : (itemForm.openingBalance || 0),
          notes: itemForm.notes,
          isActive: selectedItem?.isActive ?? true,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!payload?.ok) {
        setMessage(extractApiErrorMessage(payload, itemId ? 'INVENTORY_ITEM_UPDATE_FAILED' : 'INVENTORY_ITEM_CREATE_FAILED'));
        return;
      }
      const refreshed = await refresh();
      if (!refreshed) return;
      setMessage(itemId ? 'تم تحديث الخامة.' : 'تمت إضافة الخامة.');
      resetItemForm();
    } finally {
      setBusy(false);
    }
  }

  async function toggleItem(item: InventoryItem) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/owner/inventory/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      const payload = await response.json().catch(() => null);
      if (!payload?.ok) {
        setMessage(extractApiErrorMessage(payload, 'INVENTORY_ITEM_STATUS_FAILED'));
        return;
      }
      const refreshed = await refresh();
      if (!refreshed) return;
      setMessage(item.isActive ? 'تم إيقاف الخامة.' : 'تمت إعادة تفعيل الخامة.');
    } finally {
      setBusy(false);
    }
  }

  async function submitSupplier() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(supplierId ? `/api/owner/inventory/suppliers/${supplierId}` : '/api/owner/inventory/suppliers', {
        method: supplierId ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          supplierName: supplierForm.supplierName,
          phone: supplierForm.phone,
          notes: supplierForm.notes,
          isActive: selectedSupplier?.isActive ?? true,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!payload?.ok) {
        setMessage(extractApiErrorMessage(payload, supplierId ? 'INVENTORY_SUPPLIER_UPDATE_FAILED' : 'INVENTORY_SUPPLIER_CREATE_FAILED'));
        return;
      }
      const refreshed = await refresh();
      if (!refreshed) return;
      setMessage(supplierId ? 'تم تحديث المورد.' : 'تمت إضافة المورد.');
      resetSupplierForm();
    } finally {
      setBusy(false);
    }
  }

  async function toggleSupplier(supplier: InventorySupplier) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/owner/inventory/suppliers/${supplier.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isActive: !supplier.isActive }),
      });
      const payload = await response.json().catch(() => null);
      if (!payload?.ok) {
        setMessage(extractApiErrorMessage(payload, 'INVENTORY_SUPPLIER_STATUS_FAILED'));
        return;
      }
      const refreshed = await refresh();
      if (!refreshed) return;
      setMessage(supplier.isActive ? 'تم إيقاف المورد.' : 'تمت إعادة تفعيل المورد.');
    } finally {
      setBusy(false);
    }
  }

  async function submitMovement() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/owner/inventory/movements', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          inventoryItemId: movementForm.inventoryItemId,
          movementKind: movementForm.movementKind,
          quantity: movementForm.quantity,
          adjustmentDirection: movementForm.adjustmentDirection,
          supplierId: movementForm.supplierId || null,
          notes: movementForm.notes,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!payload?.ok) {
        setMessage(extractApiErrorMessage(payload, 'INVENTORY_MOVEMENT_CREATE_FAILED'));
        return;
      }
      const refreshed = await refresh();
      if (!refreshed) return;
      setMessage('تم تسجيل الحركة.');
      setMovementForm(emptyMovementForm(movementForm.inventoryItemId));
    } finally {
      setBusy(false);
    }
  }

  async function submitProductRecipe() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(productRecipeId ? `/api/owner/inventory/recipes/products/${productRecipeId}` : '/api/owner/inventory/recipes/products', {
        method: productRecipeId ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          menuProductId: productRecipeForm.menuProductId,
          inventoryItemId: productRecipeForm.inventoryItemId,
          quantityPerUnit: productRecipeForm.quantityPerUnit,
          wastagePercent: productRecipeForm.wastagePercent || 0,
          notes: productRecipeForm.notes,
          isActive: selectedProductRecipe?.isActive ?? true,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!payload?.ok) {
        setMessage(extractApiErrorMessage(payload, productRecipeId ? 'INVENTORY_PRODUCT_RECIPE_UPDATE_FAILED' : 'INVENTORY_PRODUCT_RECIPE_CREATE_FAILED'));
        return;
      }
      const refreshed = await refresh();
      if (!refreshed) return;
      setMessage(productRecipeId ? 'تم تحديث وصفة المنتج.' : 'تمت إضافة وصفة المنتج.');
      resetProductRecipeForm();
    } finally {
      setBusy(false);
    }
  }

  async function toggleProductRecipe(recipe: InventoryProductRecipe) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/owner/inventory/recipes/products/${recipe.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          quantityPerUnit: recipe.quantityPerUnit,
          wastagePercent: recipe.wastagePercent,
          notes: recipe.notes,
          isActive: !recipe.isActive,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!payload?.ok) {
        setMessage(extractApiErrorMessage(payload, 'INVENTORY_PRODUCT_RECIPE_STATUS_FAILED'));
        return;
      }
      const refreshed = await refresh();
      if (!refreshed) return;
      setMessage(recipe.isActive ? 'تم إيقاف وصفة المنتج.' : 'تمت إعادة تفعيل وصفة المنتج.');
    } finally {
      setBusy(false);
    }
  }

  async function submitAddonRecipe() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(addonRecipeId ? `/api/owner/inventory/recipes/addons/${addonRecipeId}` : '/api/owner/inventory/recipes/addons', {
        method: addonRecipeId ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          menuAddonId: addonRecipeForm.menuAddonId,
          inventoryItemId: addonRecipeForm.inventoryItemId,
          quantityPerUnit: addonRecipeForm.quantityPerUnit,
          wastagePercent: addonRecipeForm.wastagePercent || 0,
          notes: addonRecipeForm.notes,
          isActive: selectedAddonRecipe?.isActive ?? true,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!payload?.ok) {
        setMessage(extractApiErrorMessage(payload, addonRecipeId ? 'INVENTORY_ADDON_RECIPE_UPDATE_FAILED' : 'INVENTORY_ADDON_RECIPE_CREATE_FAILED'));
        return;
      }
      const refreshed = await refresh();
      if (!refreshed) return;
      setMessage(addonRecipeId ? 'تم تحديث وصفة الإضافة.' : 'تمت إضافة وصفة الإضافة.');
      resetAddonRecipeForm();
    } finally {
      setBusy(false);
    }
  }

  async function toggleAddonRecipe(recipe: InventoryAddonRecipe) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/owner/inventory/recipes/addons/${recipe.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          quantityPerUnit: recipe.quantityPerUnit,
          wastagePercent: recipe.wastagePercent,
          notes: recipe.notes,
          isActive: !recipe.isActive,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!payload?.ok) {
        setMessage(extractApiErrorMessage(payload, 'INVENTORY_ADDON_RECIPE_STATUS_FAILED'));
        return;
      }
      const refreshed = await refresh();
      if (!refreshed) return;
      setMessage(recipe.isActive ? 'تم إيقاف وصفة الإضافة.' : 'تمت إعادة تفعيل وصفة الإضافة.');
    } finally {
      setBusy(false);
    }
  }

  if (!can.owner) {
    return <AccessDenied title="المخزن" />;
  }

  return (
    <MobileShell title="المخزن" backHref="/owner" desktopMode="admin">
      <section className="space-y-4">
        <div className={[opsSurface, 'p-4'].join(' ')}>
          <div className="flex items-start justify-between gap-3">
            <div className="text-right">
              <div className={opsSectionTitle}>إدارة المخزون</div>
              <div className={[opsSectionHint, 'mt-1'].join(' ')}>الخامات، الموردون، الحركات، ووصفات الاستهلاك التقديري.</div>
            </div>
            <div className={opsBadge('accent')}>المرحلة 2</div>
          </div>
          {message ? <div className={[opsAlert(message.includes('تم') ? 'success' : 'danger'), 'mt-3'].join(' ')}>{message}</div> : null}
          <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-7">
            <div className={opsMetricCard('accent')}>
              <div className="text-xs opacity-80">الخامات</div>
              <div className="mt-2 text-2xl font-black">{stats.totalItems}</div>
            </div>
            <div className={opsMetricCard('warning')}>
              <div className="text-xs opacity-80">منخفضة</div>
              <div className="mt-2 text-2xl font-black">{stats.lowStock}</div>
            </div>
            <div className={opsMetricCard('danger')}>
              <div className="text-xs opacity-80">نفدت</div>
              <div className="mt-2 text-2xl font-black">{stats.emptyStock}</div>
            </div>
            <div className={opsMetricCard('info')}>
              <div className="text-xs opacity-80">الموردون</div>
              <div className="mt-2 text-2xl font-black">{stats.suppliers}</div>
            </div>
            <div className={opsMetricCard('success')}>
              <div className="text-xs opacity-80">وصفات المنتجات</div>
              <div className="mt-2 text-2xl font-black">{stats.productRecipes}</div>
            </div>
            <div className={opsMetricCard('success')}>
              <div className="text-xs opacity-80">وصفات الإضافات</div>
              <div className="mt-2 text-2xl font-black">{stats.addonRecipes}</div>
            </div>
            <div className={opsMetricCard('warning')}>
              <div className="text-xs opacity-80">عناصر حرجة</div>
              <div className="mt-2 text-2xl font-black">{stats.criticalConsumption}</div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.95fr)] xl:items-start">
          <div className="space-y-4">
            <section className={[opsSurface, 'p-4'].join(' ')}>
              <div className="flex items-start justify-between gap-3">
                <div className="text-right">
                  <div className={opsSectionTitle}>قراءة الاستهلاك التقديري</div>
                  <div className={[opsSectionHint, 'mt-1'].join(' ')}>آخر {workspace.analysisWindowDays} يوم من المبيعات مقارنة بالصرف اليدوي المسجل.</div>
                </div>
                <div className={opsBadge('info')}>تقديري فقط</div>
              </div>
              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                {filteredEstimatedConsumption.map((row) => (
                  <article key={row.inventoryItemId} className={[opsInset, 'p-4'].join(' ')}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-right">
                        <div className="text-base font-bold text-[#1e1712]">{row.itemName}</div>
                        <div className="mt-1 text-xs text-[#7d6a59]">{row.unitLabel} • {stockLabel(row.stockStatus)}</div>
                      </div>
                      <div className={opsBadge(coverageTone(row))}>{coverageLabel(row)}</div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-right text-xs text-[#6b5a4c]">
                      <div className={[opsInset, 'p-3'].join(' ')}>
                        <div>الرصيد الحالي</div>
                        <div className="mt-1 text-lg font-black text-[#1e1712]">{formatQty(row.currentBalance)}</div>
                      </div>
                      <div className={[opsInset, 'p-3'].join(' ')}>
                        <div>الاستهلاك التقديري</div>
                        <div className="mt-1 text-lg font-black text-[#1e1712]">{formatQty(row.estimatedTotal)}</div>
                      </div>
                      <div>
                        <div>من المنتجات: {formatQty(row.estimatedFromProducts)}</div>
                        <div className="mt-1">من الإضافات: {formatQty(row.estimatedFromAddons)}</div>
                        <div className="mt-1">المتوسط اليومي: {formatQty(row.avgDailyConsumption)}</div>
                      </div>
                      <div>
                        <div>الصرف المسجل: {formatQty(row.recordedOutflow)}</div>
                        <div className="mt-1">فرق القراءة: {row.varianceQuantity > 0 ? '+' : ''}{formatQty(row.varianceQuantity)}</div>
                        <div className="mt-1">الوصفات المرتبطة: {row.recipeCount}</div>
                      </div>
                    </div>
                  </article>
                ))}
                {!filteredEstimatedConsumption.length ? <div className={[opsInset, 'p-4 text-right text-sm text-[#6b5a4c] xl:col-span-2'].join(' ')}>لا توجد خامات مرتبطة بوصفات بعد.</div> : null}
              </div>
            </section>

            <section className={[opsSurface, 'p-4'].join(' ')}>
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="text-right">
                  <div className={opsSectionTitle}>الوصفات المرتبطة</div>
                  <div className={[opsSectionHint, 'mt-1'].join(' ')}>اربط المنتجات والإضافات بالخامات دون التأثير على البيع المباشر.</div>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" className={recipeScope === 'product' ? opsAccentButton : opsGhostButton} onClick={() => setRecipeScope('product')}>المنتجات</button>
                  <button type="button" className={recipeScope === 'addon' ? opsAccentButton : opsGhostButton} onClick={() => setRecipeScope('addon')}>الإضافات</button>
                </div>
              </div>
              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                {(recipeScope === 'product' ? workspace.productRecipes : workspace.addonRecipes).map((recipe) => (
                  <article key={recipe.id} className={[opsInset, 'p-4'].join(' ')}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-right">
                        <div className="text-sm font-bold text-[#1e1712]">{'productName' in recipe ? recipe.productName : recipe.addonName}</div>
                        <div className="mt-1 text-xs text-[#7d6a59]">{'stationCode' in recipe ? recipe.stationCode : ''} • {recipe.inventoryItemName}</div>
                      </div>
                      <div className={opsBadge(recipeTone(recipe.isActive))}>{recipe.isActive ? 'نشطة' : 'موقوفة'}</div>
                    </div>
                    <div className="mt-3 text-right text-xs text-[#6b5a4c]">
                      <div>الكمية لكل وحدة: {formatQty(recipe.quantityPerUnit)} {recipe.unitLabel}</div>
                      <div className="mt-1">الهالك المضاف: {formatQty(recipe.wastagePercent)}%</div>
                      {recipe.notes ? <div className="mt-1">{recipe.notes}</div> : null}
                    </div>
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      {'menuProductId' in recipe ? (
                        <>
                          <button type="button" className={opsGhostButton} onClick={() => toggleProductRecipe(recipe)} disabled={busy}>{recipe.isActive ? 'إيقاف' : 'تفعيل'}</button>
                          <button type="button" className={opsAccentButton} onClick={() => startEditProductRecipe(recipe)} disabled={busy}>تعديل</button>
                        </>
                      ) : (
                        <>
                          <button type="button" className={opsGhostButton} onClick={() => toggleAddonRecipe(recipe)} disabled={busy}>{recipe.isActive ? 'إيقاف' : 'تفعيل'}</button>
                          <button type="button" className={opsAccentButton} onClick={() => startEditAddonRecipe(recipe)} disabled={busy}>تعديل</button>
                        </>
                      )}
                    </div>
                  </article>
                ))}
                {!(recipeScope === 'product' ? workspace.productRecipes.length : workspace.addonRecipes.length) ? <div className={[opsInset, 'p-4 text-right text-sm text-[#6b5a4c] xl:col-span-2'].join(' ')}>لا توجد وصفات لهذا القسم بعد.</div> : null}
              </div>
            </section>

            <section className={[opsSurface, 'p-4'].join(' ')}>
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="text-right">
                  <div className={opsSectionTitle}>الخامات</div>
                  <div className={[opsSectionHint, 'mt-1'].join(' ')}>الرصيد الحالي وحد التنبيه.</div>
                </div>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px]">
                  <input className={opsInput} placeholder="بحث" value={query} onChange={(e) => setQuery(e.target.value)} />
                  <select className={opsSelect} value={stockFilter} onChange={(e) => setStockFilter(e.target.value as typeof stockFilter)}>
                    <option value="active">النشطة</option>
                    <option value="all">الكل</option>
                    <option value="low">منخفضة</option>
                    <option value="empty">نفدت</option>
                    <option value="inactive">الموقوفة</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                {filteredItems.map((item) => (
                  <article key={item.id} className={[opsInset, 'p-4'].join(' ')}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-right">
                        <div className="text-base font-bold text-[#1e1712]">{item.itemName}</div>
                        <div className="mt-1 text-xs text-[#7d6a59]">{item.categoryLabel ?? 'عام'}{item.itemCode ? ` • ${item.itemCode}` : ''}</div>
                      </div>
                      <div className={opsBadge(stockTone(item.stockStatus))}>{stockLabel(item.stockStatus)}</div>
                    </div>
                    <div className="mt-4 flex items-end justify-between gap-3">
                      <div className="text-right">
                        <div className="text-xs text-[#7d6a59]">الرصيد</div>
                        <div className="mt-1 text-2xl font-black text-[#1e1712]">{formatQty(item.currentBalance)}</div>
                      </div>
                      <div className="text-right text-xs text-[#7d6a59]">
                        <div>الوحدة: {item.unitLabel}</div>
                        <div className="mt-1">حد التنبيه: {formatQty(item.lowStockThreshold)}</div>
                        <div className="mt-1">آخر حركة: {formatDateTime(item.lastMovementAt)}</div>
                      </div>
                    </div>
                    {item.notes ? <div className="mt-3 text-right text-xs leading-6 text-[#6b5a4c]">{item.notes}</div> : null}
                    <div className="mt-4 flex flex-wrap justify-end gap-2">
                      <button type="button" className={opsGhostButton} onClick={() => toggleItem(item)} disabled={busy}>
                        {item.isActive ? 'إيقاف' : 'تفعيل'}
                      </button>
                      <button type="button" className={opsAccentButton} onClick={() => startEditItem(item)} disabled={busy}>
                        تعديل
                      </button>
                    </div>
                  </article>
                ))}
                {!filteredItems.length ? <div className={[opsInset, 'p-4 text-right text-sm text-[#6b5a4c] xl:col-span-2'].join(' ')}>لا توجد خامات مطابقة.</div> : null}
              </div>
            </section>

            <section className={[opsSurface, 'p-4'].join(' ')}>
              <div className={opsSectionTitle}>آخر الحركات</div>
              <div className={[opsSectionHint, 'mt-1'].join(' ')}>آخر 80 حركة مسجلة.</div>
              <div className="mt-4 space-y-3">
                {workspace.recentMovements.map((movement) => (
                  <article key={movement.id} className={[opsInset, 'p-4'].join(' ')}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-right">
                        <div className="text-sm font-bold text-[#1e1712]">{movement.itemName}</div>
                        <div className="mt-1 text-xs text-[#7d6a59]">{formatDateTime(movement.occurredAt)}</div>
                      </div>
                      <div className={opsBadge(movementTone(movement.movementKind))}>{movementLabel(movement.movementKind)}</div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="text-sm font-black text-[#1e1712]">
                        {movement.deltaQuantity > 0 ? '+' : ''}{formatQty(movement.deltaQuantity)} {movement.unitLabel}
                      </div>
                      <div className="text-right text-xs text-[#7d6a59]">
                        {movement.supplierName ? <div>المورد: {movement.supplierName}</div> : null}
                        {movement.notes ? <div className="mt-1">{movement.notes}</div> : null}
                      </div>
                    </div>
                  </article>
                ))}
                {!workspace.recentMovements.length ? <div className={[opsInset, 'p-4 text-right text-sm text-[#6b5a4c]'].join(' ')}>لا توجد حركات بعد.</div> : null}
              </div>
            </section>
          </div>

          <div className="space-y-4 xl:sticky xl:top-24">
            <section className={[opsSurface, 'p-4'].join(' ')}>
              <div className="flex items-start justify-between gap-3">
                <div className="text-right">
                  <div className={opsSectionTitle}>{recipeScope === 'product' ? (productRecipeId ? 'تعديل وصفة منتج' : 'إضافة وصفة منتج') : (addonRecipeId ? 'تعديل وصفة إضافة' : 'إضافة وصفة إضافة')}</div>
                  <div className={[opsSectionHint, 'mt-1'].join(' ')}>الوصفة هنا للقراءة والتقارير فقط، ولا تخصم من الطلب مباشرة.</div>
                </div>
                {recipeScope === 'product'
                  ? (productRecipeId ? <button type="button" className={opsGhostButton} onClick={resetProductRecipeForm}>جديد</button> : null)
                  : (addonRecipeId ? <button type="button" className={opsGhostButton} onClick={resetAddonRecipeForm}>جديد</button> : null)}
              </div>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button type="button" className={recipeScope === 'product' ? opsAccentButton : opsGhostButton} onClick={() => setRecipeScope('product')}>منتج</button>
                <button type="button" className={recipeScope === 'addon' ? opsAccentButton : opsGhostButton} onClick={() => setRecipeScope('addon')}>إضافة</button>
              </div>
              {recipeScope === 'product' ? (
                <>
                  <div className="mt-4 grid gap-2">
                    <select className={opsSelect} value={productRecipeForm.menuProductId} onChange={(e) => setProductRecipeForm((current) => ({ ...current, menuProductId: e.target.value }))} disabled={Boolean(productRecipeId)}>
                      <option value="">اختر المنتج</option>
                      {workspace.menuProducts.filter((item) => item.isActive).map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                    <select className={opsSelect} value={productRecipeForm.inventoryItemId} onChange={(e) => setProductRecipeForm((current) => ({ ...current, inventoryItemId: e.target.value }))} disabled={Boolean(productRecipeId)}>
                      <option value="">اختر الخامة</option>
                      {workspace.items.filter((item) => item.isActive).map((item) => (
                        <option key={item.id} value={item.id}>{item.itemName}</option>
                      ))}
                    </select>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input className={opsInput} inputMode="decimal" placeholder="الكمية لكل وحدة" value={productRecipeForm.quantityPerUnit} onChange={(e) => setProductRecipeForm((current) => ({ ...current, quantityPerUnit: e.target.value }))} />
                      <input className={opsInput} inputMode="decimal" placeholder="% هالك إضافي" value={productRecipeForm.wastagePercent} onChange={(e) => setProductRecipeForm((current) => ({ ...current, wastagePercent: e.target.value }))} />
                    </div>
                    <textarea className={[opsInput, 'min-h-[88px] resize-y'].join(' ')} placeholder="ملاحظات" value={productRecipeForm.notes} onChange={(e) => setProductRecipeForm((current) => ({ ...current, notes: e.target.value }))} />
                  </div>
                  <button type="button" className={[opsAccentButton, 'mt-3 w-full'].join(' ')} onClick={submitProductRecipe} disabled={busy || !productRecipeForm.menuProductId || !productRecipeForm.inventoryItemId || !productRecipeForm.quantityPerUnit.trim()}>
                    {busy ? '...' : productRecipeId ? 'حفظ وصفة المنتج' : 'إضافة وصفة المنتج'}
                  </button>
                </>
              ) : (
                <>
                  <div className="mt-4 grid gap-2">
                    <select className={opsSelect} value={addonRecipeForm.menuAddonId} onChange={(e) => setAddonRecipeForm((current) => ({ ...current, menuAddonId: e.target.value }))} disabled={Boolean(addonRecipeId)}>
                      <option value="">اختر الإضافة</option>
                      {workspace.menuAddons.filter((item) => item.isActive).map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                    <select className={opsSelect} value={addonRecipeForm.inventoryItemId} onChange={(e) => setAddonRecipeForm((current) => ({ ...current, inventoryItemId: e.target.value }))} disabled={Boolean(addonRecipeId)}>
                      <option value="">اختر الخامة</option>
                      {workspace.items.filter((item) => item.isActive).map((item) => (
                        <option key={item.id} value={item.id}>{item.itemName}</option>
                      ))}
                    </select>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input className={opsInput} inputMode="decimal" placeholder="الكمية لكل إضافة" value={addonRecipeForm.quantityPerUnit} onChange={(e) => setAddonRecipeForm((current) => ({ ...current, quantityPerUnit: e.target.value }))} />
                      <input className={opsInput} inputMode="decimal" placeholder="% هالك إضافي" value={addonRecipeForm.wastagePercent} onChange={(e) => setAddonRecipeForm((current) => ({ ...current, wastagePercent: e.target.value }))} />
                    </div>
                    <textarea className={[opsInput, 'min-h-[88px] resize-y'].join(' ')} placeholder="ملاحظات" value={addonRecipeForm.notes} onChange={(e) => setAddonRecipeForm((current) => ({ ...current, notes: e.target.value }))} />
                  </div>
                  <button type="button" className={[opsAccentButton, 'mt-3 w-full'].join(' ')} onClick={submitAddonRecipe} disabled={busy || !addonRecipeForm.menuAddonId || !addonRecipeForm.inventoryItemId || !addonRecipeForm.quantityPerUnit.trim()}>
                    {busy ? '...' : addonRecipeId ? 'حفظ وصفة الإضافة' : 'إضافة وصفة الإضافة'}
                  </button>
                </>
              )}
            </section>

            <section className={[opsSurface, 'p-4'].join(' ')}>
              <div className="flex items-start justify-between gap-3">
                <div className="text-right">
                  <div className={opsSectionTitle}>{itemId ? 'تعديل خامة' : 'إضافة خامة'}</div>
                  <div className={[opsSectionHint, 'mt-1'].join(' ')}>الرصيد الافتتاحي عند الإنشاء فقط.</div>
                </div>
                {itemId ? <button type="button" className={opsGhostButton} onClick={resetItemForm}>جديد</button> : null}
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <input className={opsInput} placeholder="اسم الخامة" value={itemForm.itemName} onChange={(e) => setItemForm((current) => ({ ...current, itemName: e.target.value }))} />
                <input className={opsInput} placeholder="كود داخلي" value={itemForm.itemCode} onChange={(e) => setItemForm((current) => ({ ...current, itemCode: e.target.value }))} />
                <input className={opsInput} placeholder="التصنيف" value={itemForm.categoryLabel} onChange={(e) => setItemForm((current) => ({ ...current, categoryLabel: e.target.value }))} />
                <input className={opsInput} placeholder="الوحدة" value={itemForm.unitLabel} onChange={(e) => setItemForm((current) => ({ ...current, unitLabel: e.target.value }))} />
                <input className={opsInput} inputMode="decimal" placeholder="حد التنبيه" value={itemForm.lowStockThreshold} onChange={(e) => setItemForm((current) => ({ ...current, lowStockThreshold: e.target.value }))} />
                {!itemId ? <input className={opsInput} inputMode="decimal" placeholder="رصيد افتتاحي" value={itemForm.openingBalance} onChange={(e) => setItemForm((current) => ({ ...current, openingBalance: e.target.value }))} /> : null}
              </div>
              <textarea className={[opsInput, 'mt-2 min-h-[96px] resize-y'].join(' ')} placeholder="ملاحظات" value={itemForm.notes} onChange={(e) => setItemForm((current) => ({ ...current, notes: e.target.value }))} />
              <button type="button" className={[opsAccentButton, 'mt-3 w-full'].join(' ')} onClick={submitItem} disabled={busy || !itemForm.itemName.trim() || !itemForm.unitLabel.trim()}>
                {busy ? '...' : itemId ? 'حفظ التعديل' : 'إضافة الخامة'}
              </button>
            </section>

            <section className={[opsSurface, 'p-4'].join(' ')}>
              <div className={opsSectionTitle}>تسجيل حركة</div>
              <div className={[opsSectionHint, 'mt-1'].join(' ')}>وارد، صرف، هالك، أو تسوية.</div>
              <div className="mt-4 grid gap-2">
                <select className={opsSelect} value={movementForm.inventoryItemId} onChange={(e) => setMovementForm((current) => ({ ...current, inventoryItemId: e.target.value }))}>
                  <option value="">اختر الخامة</option>
                  {workspace.items.filter((item) => item.isActive).map((item) => (
                    <option key={item.id} value={item.id}>{item.itemName}</option>
                  ))}
                </select>
                <div className="grid gap-2 sm:grid-cols-2">
                  <select className={opsSelect} value={movementForm.movementKind} onChange={(e) => setMovementForm((current) => ({ ...current, movementKind: e.target.value as InventoryMovement['movementKind'] }))}>
                    <option value="inbound">وارد</option>
                    <option value="outbound">صرف</option>
                    <option value="waste">هالك</option>
                    <option value="adjustment">تسوية</option>
                  </select>
                  <input className={opsInput} inputMode="decimal" placeholder="الكمية" value={movementForm.quantity} onChange={(e) => setMovementForm((current) => ({ ...current, quantity: e.target.value }))} />
                </div>
                {movementForm.movementKind === 'adjustment' ? (
                  <select className={opsSelect} value={movementForm.adjustmentDirection} onChange={(e) => setMovementForm((current) => ({ ...current, adjustmentDirection: e.target.value as 'increase' | 'decrease' }))}>
                    <option value="increase">زيادة</option>
                    <option value="decrease">نقص</option>
                  </select>
                ) : null}
                <select className={opsSelect} value={movementForm.supplierId} onChange={(e) => setMovementForm((current) => ({ ...current, supplierId: e.target.value }))}>
                  <option value="">بدون مورد</option>
                  {workspace.suppliers.filter((supplier) => supplier.isActive).map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>{supplier.supplierName}</option>
                  ))}
                </select>
                <textarea className={[opsInput, 'min-h-[88px] resize-y'].join(' ')} placeholder="ملاحظات" value={movementForm.notes} onChange={(e) => setMovementForm((current) => ({ ...current, notes: e.target.value }))} />
              </div>
              <button type="button" className={[opsAccentButton, 'mt-3 w-full'].join(' ')} onClick={submitMovement} disabled={busy || !movementForm.inventoryItemId || !movementForm.quantity.trim()}>
                {busy ? '...' : 'تسجيل الحركة'}
              </button>
            </section>

            <section className={[opsSurface, 'p-4'].join(' ')}>
              <div className="flex items-start justify-between gap-3">
                <div className="text-right">
                  <div className={opsSectionTitle}>{supplierId ? 'تعديل مورد' : 'إضافة مورد'}</div>
                  <div className={[opsSectionHint, 'mt-1'].join(' ')}>الموردون الحاليون للمخزن.</div>
                </div>
                {supplierId ? <button type="button" className={opsGhostButton} onClick={resetSupplierForm}>جديد</button> : null}
              </div>
              <div className="mt-4 grid gap-2">
                <input className={opsInput} placeholder="اسم المورد" value={supplierForm.supplierName} onChange={(e) => setSupplierForm((current) => ({ ...current, supplierName: e.target.value }))} />
                <input className={opsInput} placeholder="الهاتف" value={supplierForm.phone} onChange={(e) => setSupplierForm((current) => ({ ...current, phone: e.target.value }))} />
                <textarea className={[opsInput, 'min-h-[88px] resize-y'].join(' ')} placeholder="ملاحظات" value={supplierForm.notes} onChange={(e) => setSupplierForm((current) => ({ ...current, notes: e.target.value }))} />
              </div>
              <button type="button" className={[opsAccentButton, 'mt-3 w-full'].join(' ')} onClick={submitSupplier} disabled={busy || !supplierForm.supplierName.trim()}>
                {busy ? '...' : supplierId ? 'حفظ المورد' : 'إضافة المورد'}
              </button>

              <div className="mt-4 space-y-2">
                {workspace.suppliers.map((supplier) => (
                  <article key={supplier.id} className={[opsInset, 'p-3'].join(' ')}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-right">
                        <div className="text-sm font-bold text-[#1e1712]">{supplier.supplierName}</div>
                        <div className="mt-1 text-xs text-[#7d6a59]">{supplier.phone ?? 'بدون هاتف'}</div>
                      </div>
                      <div className={opsBadge(supplier.isActive ? 'success' : 'neutral')}>{supplier.isActive ? 'نشط' : 'موقوف'}</div>
                    </div>
                    {supplier.notes ? <div className="mt-2 text-right text-xs text-[#6b5a4c]">{supplier.notes}</div> : null}
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <button type="button" className={opsGhostButton} onClick={() => toggleSupplier(supplier)} disabled={busy}>{supplier.isActive ? 'إيقاف' : 'تفعيل'}</button>
                      <button type="button" className={opsAccentButton} onClick={() => startEditSupplier(supplier)} disabled={busy}>تعديل</button>
                    </div>
                  </article>
                ))}
                {!workspace.suppliers.length ? <div className={[opsInset, 'p-3 text-right text-sm text-[#6b5a4c]'].join(' ')}>لا يوجد موردون بعد.</div> : null}
              </div>
            </section>
          </div>
        </div>
      </section>
    </MobileShell>
  );
}
