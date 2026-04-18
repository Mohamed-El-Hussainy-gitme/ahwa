'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MobileShell } from '@/ui/MobileShell';
import { AccessDenied } from '@/ui/AccessState';
import { useAuthz } from '@/lib/authz';
import { extractApiErrorMessage } from '@/lib/api/errors';
import { OPS_CACHE_TAGS } from '@/lib/ops/cache-tags';
import { buildQueuedMutation, useOpsPwa } from '@/lib/pwa/provider';
import { isOfflineLikeError } from '@/lib/pwa/admin-queue';
import { usePersistentDraft } from '@/lib/pwa/use-persistent-draft';
import { useWorkspaceSnapshot } from '@/lib/pwa/workspace-snapshot';
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
import {
  INVENTORY_ITEM_TEMPLATES,
  INVENTORY_STRUCTURED_OPTION_BUNDLES,
  type InventoryItemTemplate,
} from '@/lib/ops/inventory-presets';

const INVENTORY_VIEWS = [
  { key: 'daily', label: 'اليوم', hint: 'وارد، جرد، نقص' },
  { key: 'items', label: 'الخامات', hint: 'تعريف ورصيد' },
  { key: 'recipes', label: 'الوصفات', hint: 'ربط واستهلاك' },
  { key: 'suppliers', label: 'الموردون', hint: 'الموردون والتوريد' },
  { key: 'analysis', label: 'التحليل', hint: 'قراءة الفرق' },
] as const;

type InventoryView = (typeof INVENTORY_VIEWS)[number]['key'];

const INVENTORY_DRAFT_KEYS = {
  item: 'ahwa:draft:inventory:item:v1',
  supplier: 'ahwa:draft:inventory:supplier:v1',
  movement: 'ahwa:draft:inventory:movement:v1',
  quickCount: 'ahwa:draft:inventory:quick-count:v1',
  productRecipe: 'ahwa:draft:inventory:product-recipe:v1',
  addonRecipe: 'ahwa:draft:inventory:addon-recipe:v1',
  structuredBundle: 'ahwa:draft:inventory:structured-bundle:v1',
  structuredItem: 'ahwa:draft:inventory:structured-item:v1',
  structuredRows: 'ahwa:draft:inventory:structured-rows:v1',
  workspace: 'ahwa:workspace:inventory:v1',
} as const;

function emptyItemForm() {
  return {
    itemName: '',
    itemCode: '',
    categoryLabel: '',
    unitLabel: 'قطعة',
    purchaseUnitLabel: '',
    purchaseToStockFactor: '',
    lowStockThreshold: '',
    openingBalance: '',
    openingBalanceUnit: 'stock' as 'stock' | 'purchase',
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
    entryUnit: 'stock' as 'stock' | 'purchase',
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

function emptyQuickCountForm(itemId = '') {
  return {
    inventoryItemId: itemId,
    actualQuantity: '',
    entryUnit: 'stock' as 'stock' | 'purchase',
    notes: '',
  };
}

type StructuredOptionFormRow = {
  key: string;
  label: string;
  menuAddonId: string;
  quantityPerUnit: string;
  notes: string;
};

function createStructuredOptionRows(bundleKey: string): StructuredOptionFormRow[] {
  const bundle = INVENTORY_STRUCTURED_OPTION_BUNDLES.find((item) => item.key === bundleKey) ?? INVENTORY_STRUCTURED_OPTION_BUNDLES[0];
  if (!bundle) return [];
  return bundle.rows.map((row) => ({
    key: row.key,
    label: row.label,
    menuAddonId: '',
    quantityPerUnit: row.defaultQuantity ? String(row.defaultQuantity) : '',
    notes: row.note ?? '',
  }));
}

function applyInventoryItemTemplate(template: InventoryItemTemplate) {
  return {
    itemName: template.itemName,
    itemCode: '',
    categoryLabel: template.categoryLabel,
    unitLabel: template.unitLabel,
    purchaseUnitLabel: template.purchaseUnitLabel ?? '',
    purchaseToStockFactor: template.purchaseToStockFactor ? String(template.purchaseToStockFactor) : '',
    lowStockThreshold: template.lowStockThreshold > 0 ? String(template.lowStockThreshold) : '',
    openingBalance: '',
    openingBalanceUnit: template.purchaseUnitLabel ? ('purchase' as const) : ('stock' as const),
    notes: template.notes,
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
    recentShiftSnapshots: [],
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

function formatItemUnitSummary(item: Pick<InventoryItem, 'unitLabel' | 'purchaseUnitLabel' | 'purchaseToStockFactor'>) {
  if (item.purchaseUnitLabel) {
    return `التشغيل: ${item.unitLabel} • الشراء: ${item.purchaseUnitLabel} × ${formatQty(item.purchaseToStockFactor)}`;
  }
  return `التشغيل: ${item.unitLabel}`;
}

function previewEntryInStockUnit(item: Pick<InventoryItem, 'unitLabel' | 'purchaseUnitLabel' | 'purchaseToStockFactor'> | null, quantityText: string, entryUnit: 'stock' | 'purchase') {
  const quantity = Number(quantityText || 0);
  if (!item || !Number.isFinite(quantity) || quantity <= 0) return null;
  if (entryUnit === 'purchase' && item.purchaseUnitLabel) {
    return {
      stockQuantity: quantity * (item.purchaseToStockFactor || 1),
      inputUnitLabel: item.purchaseUnitLabel,
      stockUnitLabel: item.unitLabel,
    };
  }
  return {
    stockQuantity: quantity,
    inputUnitLabel: item.unitLabel,
    stockUnitLabel: item.unitLabel,
  };
}

export default function InventoryPage() {
  const { can } = useAuthz();
  const { enqueueMutation, isOnline } = useOpsPwa();
  const [workspace, setWorkspace] = useState<InventoryWorkspace>(emptyWorkspace());
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [postingBusyFor, setPostingBusyFor] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'active' | 'low' | 'empty' | 'inactive'>('active');
  const [itemId, setItemId] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [productRecipeId, setProductRecipeId] = useState<string | null>(null);
  const [addonRecipeId, setAddonRecipeId] = useState<string | null>(null);
  const [recipeScope, setRecipeScope] = useState<'product' | 'addon'>('product');
  const [inventoryView, setInventoryView] = useState<InventoryView>('daily');
  const [itemForm, setItemForm, itemDraft] = usePersistentDraft(INVENTORY_DRAFT_KEYS.item, emptyItemForm);
  const [supplierForm, setSupplierForm, supplierDraft] = usePersistentDraft(INVENTORY_DRAFT_KEYS.supplier, emptySupplierForm);
  const [movementForm, setMovementForm, movementDraft] = usePersistentDraft(INVENTORY_DRAFT_KEYS.movement, emptyMovementForm);
  const [quickCountForm, setQuickCountForm, quickCountDraft] = usePersistentDraft(INVENTORY_DRAFT_KEYS.quickCount, emptyQuickCountForm);
  const [productRecipeForm, setProductRecipeForm, productRecipeDraft] = usePersistentDraft(INVENTORY_DRAFT_KEYS.productRecipe, emptyProductRecipeForm);
  const [addonRecipeForm, setAddonRecipeForm, addonRecipeDraft] = usePersistentDraft(INVENTORY_DRAFT_KEYS.addonRecipe, emptyAddonRecipeForm);
  const [structuredBundleKey, setStructuredBundleKey, structuredBundleDraft] = usePersistentDraft(INVENTORY_DRAFT_KEYS.structuredBundle, INVENTORY_STRUCTURED_OPTION_BUNDLES[0]?.key ?? 'sugar-levels');
  const [structuredItemId, setStructuredItemId, structuredItemDraft] = usePersistentDraft(INVENTORY_DRAFT_KEYS.structuredItem, '');
  const [structuredOptionRows, setStructuredOptionRows, structuredRowsDraft] = usePersistentDraft<StructuredOptionFormRow[]>(INVENTORY_DRAFT_KEYS.structuredRows, () => createStructuredOptionRows(INVENTORY_STRUCTURED_OPTION_BUNDLES[0]?.key ?? 'sugar-levels'));

  const inventoryWorkspace = useWorkspaceSnapshot<InventoryWorkspace>(
    useCallback(async () => {
      const response = await fetch('/api/owner/inventory/workspace', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!payload?.ok) {
        throw new Error(extractApiErrorMessage(payload, 'INVENTORY_WORKSPACE_FAILED'));
      }
      return payload.workspace as InventoryWorkspace;
    }, []),
    {
      cacheKey: 'workspace:inventory',
      invalidationTags: [OPS_CACHE_TAGS.inventory],
      staleTimeMs: 20_000,
      enabled: can.owner,
      storageKey: INVENTORY_DRAFT_KEYS.workspace,
    },
  );

  const applyWorkspace = useCallback((nextWorkspace: InventoryWorkspace) => {
    setWorkspace(nextWorkspace);
    setMovementForm((current) => {
      if (current.inventoryItemId && nextWorkspace.items.some((item) => item.id === current.inventoryItemId)) {
        return current;
      }
      const firstActive = nextWorkspace.items.find((item) => item.isActive);
      return { ...current, inventoryItemId: firstActive?.id ?? '' };
    });
    setQuickCountForm((current) => {
      if (current.inventoryItemId && nextWorkspace.items.some((item) => item.id === current.inventoryItemId)) {
        return current;
      }
      const prioritized = nextWorkspace.items.find((item) => item.stockStatus === 'low' || item.stockStatus === 'empty')
        ?? nextWorkspace.items.find((item) => item.isActive);
      return { ...current, inventoryItemId: prioritized?.id ?? '' };
    });
    setStructuredItemId((current) => {
      if (current && nextWorkspace.items.some((item) => item.id === current)) {
        return current;
      }
      const sugarLikeItem = nextWorkspace.items.find((item) => item.normalizedName.includes('سكر'));
      return sugarLikeItem?.id ?? current;
    });
  }, [setMovementForm, setQuickCountForm, setStructuredItemId]);

  useEffect(() => {
    if (inventoryWorkspace.data) {
      applyWorkspace(inventoryWorkspace.data);
    }
  }, [applyWorkspace, inventoryWorkspace.data]);

  useEffect(() => {
    if (inventoryWorkspace.usingSnapshotFallback) {
      setMessage('يعرض المخزن آخر نسخة محفوظة محليًا لحين عودة الاتصال.');
    }
  }, [inventoryWorkspace.usingSnapshotFallback]);

  const refresh = useCallback(async () => {
    setMessage(null);
    const nextWorkspace = await inventoryWorkspace.reload();
    if (nextWorkspace) {
      applyWorkspace(nextWorkspace);
      return true;
    }
    if (inventoryWorkspace.data) {
      applyWorkspace(inventoryWorkspace.data);
      if (inventoryWorkspace.usingSnapshotFallback || inventoryWorkspace.online === false) {
        setMessage('تمت استعادة آخر نسخة محفوظة محليًا.');
        return true;
      }
    }
    if (inventoryWorkspace.error) {
      setMessage(inventoryWorkspace.error);
    }
    return false;
  }, [applyWorkspace, inventoryWorkspace]);

  const runQueueableMutation = useCallback(async (options: {
    url: string;
    method?: 'POST' | 'PATCH';
    body: unknown;
    successMessage: string | ((payload: any) => string);
    queuedMessage: string;
    failureCode: string;
    invalidateTags?: readonly string[];
    clearDraftKeys?: string[];
    onSuccess?: (payload: any) => void;
    onQueued?: () => void;
  }) => {
    const method = options.method ?? 'POST';
    if (!isOnline) {
      await enqueueMutation(buildQueuedMutation({
        url: options.url,
        method,
        body: options.body,
        label: options.queuedMessage,
        invalidateTags: options.invalidateTags ?? [OPS_CACHE_TAGS.inventory],
        clearDraftKeys: options.clearDraftKeys,
      }));
      options.onQueued?.();
      setMessage(options.queuedMessage);
      return true;
    }
    try {
      const response = await fetch(options.url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(options.body),
      });
      const payload = await response.json().catch(() => null);
      if (!payload?.ok) {
        setMessage(extractApiErrorMessage(payload, options.failureCode));
        return false;
      }
      const refreshed = await refresh();
      if (!refreshed && !inventoryWorkspace.data) return false;
      options.onSuccess?.(payload);
      setMessage(typeof options.successMessage === 'function' ? options.successMessage(payload) : options.successMessage);
      return true;
    } catch (error) {
      if (!isOfflineLikeError(error)) {
        throw error;
      }
      await enqueueMutation(buildQueuedMutation({
        url: options.url,
        method,
        body: options.body,
        label: options.queuedMessage,
        invalidateTags: options.invalidateTags ?? [OPS_CACHE_TAGS.inventory],
        clearDraftKeys: options.clearDraftKeys,
      }));
      options.onQueued?.();
      setMessage(options.queuedMessage);
      return true;
    }
  }, [enqueueMutation, inventoryWorkspace.data, isOnline, refresh]);

  async function postShiftSnapshot(shiftId: string) {
    setPostingBusyFor(shiftId);
    setMessage(null);
    try {
      const response = await fetch('/api/owner/inventory/shift-postings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ shiftId }),
      });
      const payload = await response.json().catch(() => null);
      if (!payload?.ok) {
        setMessage(extractApiErrorMessage(payload, 'SHIFT_INVENTORY_POST_FAILED'));
        return;
      }
      await refresh();
      const posted = payload.posting?.alreadyPosted ? 'تم الترحيل مسبقًا لهذا السناب شوت.' : 'تم ترحيل استهلاك الوردية إلى المخزن.';
      setMessage(posted);
    } finally {
      setPostingBusyFor(null);
    }
  }


  const selectedItem = useMemo(
    () => workspace.items.find((item) => item.id === itemId) ?? null,
    [workspace.items, itemId],
  );

  const selectedSupplier = useMemo(
    () => workspace.suppliers.find((item) => item.id === supplierId) ?? null,
    [workspace.suppliers, supplierId],
  );

  const selectedMovementItem = useMemo(
    () => workspace.items.find((item) => item.id === movementForm.inventoryItemId) ?? null,
    [workspace.items, movementForm.inventoryItemId],
  );

  const selectedQuickCountItem = useMemo(
    () => workspace.items.find((item) => item.id === quickCountForm.inventoryItemId) ?? null,
    [workspace.items, quickCountForm.inventoryItemId],
  );

  const selectedStructuredItem = useMemo(
    () => workspace.items.find((item) => item.id === structuredItemId) ?? null,
    [workspace.items, structuredItemId],
  );

  const selectedStructuredBundle = useMemo(
    () => INVENTORY_STRUCTURED_OPTION_BUNDLES.find((item) => item.key === structuredBundleKey) ?? INVENTORY_STRUCTURED_OPTION_BUNDLES[0] ?? null,
    [structuredBundleKey],
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
      const haystack = [item.itemName, item.itemCode ?? '', item.categoryLabel ?? '', item.unitLabel, item.purchaseUnitLabel ?? ''].join(' ').toLowerCase();
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

  const openingBalancePreview = useMemo(
    () => previewEntryInStockUnit(
      {
        unitLabel: itemForm.unitLabel || 'وحدة',
        purchaseUnitLabel: itemForm.purchaseUnitLabel || null,
        purchaseToStockFactor: Number(itemForm.purchaseToStockFactor || 1),
      },
      itemForm.openingBalance,
      itemForm.openingBalanceUnit,
    ),
    [itemForm.openingBalance, itemForm.openingBalanceUnit, itemForm.purchaseToStockFactor, itemForm.purchaseUnitLabel, itemForm.unitLabel],
  );

  const movementPreview = useMemo(
    () => previewEntryInStockUnit(selectedMovementItem, movementForm.quantity, movementForm.entryUnit),
    [selectedMovementItem, movementForm.quantity, movementForm.entryUnit],
  );

  const quickCountPreview = useMemo(
    () => previewEntryInStockUnit(selectedQuickCountItem, quickCountForm.actualQuantity, quickCountForm.entryUnit),
    [selectedQuickCountItem, quickCountForm.actualQuantity, quickCountForm.entryUnit],
  );

  const quickCountVariance = useMemo(() => {
    if (!selectedQuickCountItem || !quickCountPreview) return null;
    return Number((quickCountPreview.stockQuantity - selectedQuickCountItem.currentBalance).toFixed(3));
  }, [quickCountPreview, selectedQuickCountItem]);

  const quickCountFocusItems = useMemo(() => {
    const focus = workspace.items.filter((item) => item.stockStatus === 'low' || item.stockStatus === 'empty');
    return focus.length ? focus.slice(0, 8) : workspace.items.filter((item) => item.isActive).slice(0, 8);
  }, [workspace.items]);

  useEffect(() => {
    setMovementForm((current) => {
      const canUsePurchase = current.movementKind === 'inbound' && Boolean(selectedMovementItem?.purchaseUnitLabel);
      const nextEntryUnit = canUsePurchase ? current.entryUnit : 'stock';
      if (current.entryUnit === nextEntryUnit) return current;
      return { ...current, entryUnit: nextEntryUnit };
    });
  }, [selectedMovementItem?.id, selectedMovementItem?.purchaseUnitLabel, movementForm.movementKind]);

  useEffect(() => {
    setQuickCountForm((current) => {
      const canUsePurchase = Boolean(selectedQuickCountItem?.purchaseUnitLabel);
      const nextEntryUnit = canUsePurchase ? current.entryUnit : 'stock';
      if (current.entryUnit === nextEntryUnit) return current;
      return { ...current, entryUnit: nextEntryUnit };
    });
  }, [selectedQuickCountItem?.id, selectedQuickCountItem?.purchaseUnitLabel]);

  useEffect(() => {
    setStructuredOptionRows((current) => {
      const seeded = createStructuredOptionRows(structuredBundleKey);
      if (!current.length) return seeded;
      return seeded.map((row) => {
        const existing = current.find((item) => item.key === row.key);
        return existing ? { ...row, menuAddonId: existing.menuAddonId, quantityPerUnit: existing.quantityPerUnit, notes: existing.notes } : row;
      });
    });
  }, [structuredBundleKey, setStructuredOptionRows]);

  const stats = useMemo(() => ({
    totalItems: workspace.items.length,
    lowStock: workspace.items.filter((item) => item.stockStatus === 'low').length,
    emptyStock: workspace.items.filter((item) => item.stockStatus === 'empty').length,
    suppliers: workspace.suppliers.filter((supplier) => supplier.isActive).length,
    productRecipes: workspace.productRecipes.filter((recipe) => recipe.isActive).length,
    addonRecipes: workspace.addonRecipes.filter((recipe) => recipe.isActive).length,
    criticalConsumption: workspace.estimatedConsumption.filter((row) => row.stockStatus === 'empty' || row.stockStatus === 'low' || (row.coverageDays !== null && row.coverageDays <= 3)).length,
  }), [workspace]);


  const criticalItems = useMemo(() => workspace.items.filter((item) => item.stockStatus === 'low' || item.stockStatus === 'empty'), [workspace.items]);

  const prioritizedItems = useMemo(() => criticalItems.length ? criticalItems : workspace.items.filter((item) => item.isActive), [criticalItems, workspace.items]);

  const criticalConsumptionRows = useMemo(() => workspace.estimatedConsumption.filter((row) => row.stockStatus === 'empty' || row.stockStatus === 'low' || (row.coverageDays !== null && row.coverageDays <= 7)), [workspace.estimatedConsumption]);

  const recentInboundMovements = useMemo(() => workspace.recentMovements.filter((movement) => movement.movementKind === 'inbound').slice(0, 12), [workspace.recentMovements]);

  function resetItemForm() {
    setItemId(null);
    itemDraft.resetDraft();
  }

  function resetSupplierForm() {
    setSupplierId(null);
    supplierDraft.resetDraft();
  }

  function resetProductRecipeForm() {
    setProductRecipeId(null);
    productRecipeDraft.resetDraft();
  }

  function resetAddonRecipeForm() {
    setAddonRecipeId(null);
    addonRecipeDraft.resetDraft();
  }

  function startEditItem(item: InventoryItem) {
    setItemId(item.id);
    setItemForm({
      itemName: item.itemName,
      itemCode: item.itemCode ?? '',
      categoryLabel: item.categoryLabel ?? '',
      unitLabel: item.unitLabel,
      purchaseUnitLabel: item.purchaseUnitLabel ?? '',
      purchaseToStockFactor: item.purchaseUnitLabel ? String(item.purchaseToStockFactor) : '',
      lowStockThreshold: item.lowStockThreshold > 0 ? String(item.lowStockThreshold) : '',
      openingBalance: '',
      openingBalanceUnit: 'stock',
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
      await runQueueableMutation({
        url: itemId ? `/api/owner/inventory/items/${itemId}` : '/api/owner/inventory/items',
        method: itemId ? 'PATCH' : 'POST',
        body: {
          itemName: itemForm.itemName,
          itemCode: itemForm.itemCode,
          categoryLabel: itemForm.categoryLabel,
          unitLabel: itemForm.unitLabel,
          purchaseUnitLabel: itemForm.purchaseUnitLabel || null,
          purchaseToStockFactor: itemForm.purchaseUnitLabel ? (itemForm.purchaseToStockFactor || 1) : null,
          lowStockThreshold: itemForm.lowStockThreshold || 0,
          openingBalance: itemId ? undefined : (itemForm.openingBalance || 0),
          openingBalanceEntryUnit: itemId ? undefined : itemForm.openingBalanceUnit,
          notes: itemForm.notes,
          isActive: selectedItem?.isActive ?? true,
        },
        successMessage: itemId ? 'تم تحديث الخامة.' : 'تمت إضافة الخامة.',
        queuedMessage: itemId ? 'تم حفظ تعديل الخامة في الطابور المحلي.' : 'تم حفظ الخامة الجديدة في الطابور المحلي.',
        failureCode: itemId ? 'INVENTORY_ITEM_UPDATE_FAILED' : 'INVENTORY_ITEM_CREATE_FAILED',
        invalidateTags: [OPS_CACHE_TAGS.inventory],
        clearDraftKeys: [INVENTORY_DRAFT_KEYS.item],
        onSuccess: () => resetItemForm(),
        onQueued: () => resetItemForm(),
      });
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
      await runQueueableMutation({
        url: supplierId ? `/api/owner/inventory/suppliers/${supplierId}` : '/api/owner/inventory/suppliers',
        method: supplierId ? 'PATCH' : 'POST',
        body: {
          supplierName: supplierForm.supplierName,
          phone: supplierForm.phone,
          notes: supplierForm.notes,
          isActive: selectedSupplier?.isActive ?? true,
        },
        successMessage: supplierId ? 'تم تحديث المورد.' : 'تمت إضافة المورد.',
        queuedMessage: supplierId ? 'تم حفظ تعديل المورد في الطابور المحلي.' : 'تم حفظ المورد الجديد في الطابور المحلي.',
        failureCode: supplierId ? 'INVENTORY_SUPPLIER_UPDATE_FAILED' : 'INVENTORY_SUPPLIER_CREATE_FAILED',
        invalidateTags: [OPS_CACHE_TAGS.inventory],
        clearDraftKeys: [INVENTORY_DRAFT_KEYS.supplier],
        onSuccess: () => resetSupplierForm(),
        onQueued: () => resetSupplierForm(),
      });
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
      const currentItemId = movementForm.inventoryItemId;
      await runQueueableMutation({
        url: '/api/owner/inventory/movements',
        body: {
          inventoryItemId: movementForm.inventoryItemId,
          movementKind: movementForm.movementKind,
          quantity: movementForm.quantity,
          entryUnit: movementForm.entryUnit,
          adjustmentDirection: movementForm.adjustmentDirection,
          supplierId: movementForm.supplierId || null,
          notes: movementForm.notes,
        },
        successMessage: 'تم تسجيل الحركة.',
        queuedMessage: 'تم حفظ حركة المخزن في الطابور المحلي.',
        failureCode: 'INVENTORY_MOVEMENT_CREATE_FAILED',
        invalidateTags: [OPS_CACHE_TAGS.inventory],
        clearDraftKeys: [INVENTORY_DRAFT_KEYS.movement],
        onSuccess: () => movementDraft.restoreDraft(emptyMovementForm(currentItemId)),
        onQueued: () => movementDraft.restoreDraft(emptyMovementForm(currentItemId)),
      });
    } finally {
      setBusy(false);
    }
  }

  function applyItemTemplate(template: InventoryItemTemplate) {
    setItemId(null);
    setItemForm(applyInventoryItemTemplate(template));
    setMessage(`تم تجهيز قالب ${template.title}.`);
  }

  async function submitQuickCount() {
    setBusy(true);
    setMessage(null);
    try {
      const currentItemId = quickCountForm.inventoryItemId;
      await runQueueableMutation({
        url: '/api/owner/inventory/quick-count',
        body: {
          inventoryItemId: quickCountForm.inventoryItemId,
          actualQuantity: quickCountForm.actualQuantity,
          entryUnit: quickCountForm.entryUnit,
          notes: quickCountForm.notes,
        },
        successMessage: (payload) => {
          const result = payload.result as { skipped?: boolean; varianceQuantity?: number; unitLabel?: string };
          return result?.skipped ? 'الجرد مطابق للرصيد الحالي.' : `تم حفظ الجرد السريع (${result?.varianceQuantity && result.varianceQuantity > 0 ? '+' : ''}${formatQty(Number(result?.varianceQuantity ?? 0))} ${result?.unitLabel ?? ''}).`;
        },
        queuedMessage: 'تم حفظ الجرد السريع في الطابور المحلي.',
        failureCode: 'INVENTORY_QUICK_COUNT_FAILED',
        invalidateTags: [OPS_CACHE_TAGS.inventory],
        clearDraftKeys: [INVENTORY_DRAFT_KEYS.quickCount],
        onSuccess: () => quickCountDraft.restoreDraft(emptyQuickCountForm(currentItemId)),
        onQueued: () => quickCountDraft.restoreDraft(emptyQuickCountForm(currentItemId)),
      });
    } finally {
      setBusy(false);
    }
  }

  async function submitProductRecipe() {
    setBusy(true);
    setMessage(null);
    try {
      await runQueueableMutation({
        url: productRecipeId ? `/api/owner/inventory/recipes/products/${productRecipeId}` : '/api/owner/inventory/recipes/products',
        method: productRecipeId ? 'PATCH' : 'POST',
        body: {
          menuProductId: productRecipeForm.menuProductId,
          inventoryItemId: productRecipeForm.inventoryItemId,
          quantityPerUnit: productRecipeForm.quantityPerUnit,
          wastagePercent: productRecipeForm.wastagePercent || 0,
          notes: productRecipeForm.notes,
          isActive: selectedProductRecipe?.isActive ?? true,
        },
        successMessage: productRecipeId ? 'تم تحديث وصفة المنتج.' : 'تمت إضافة وصفة المنتج.',
        queuedMessage: productRecipeId ? 'تم حفظ تعديل وصفة المنتج في الطابور المحلي.' : 'تم حفظ وصفة المنتج في الطابور المحلي.',
        failureCode: productRecipeId ? 'INVENTORY_PRODUCT_RECIPE_UPDATE_FAILED' : 'INVENTORY_PRODUCT_RECIPE_CREATE_FAILED',
        invalidateTags: [OPS_CACHE_TAGS.inventory],
        clearDraftKeys: [INVENTORY_DRAFT_KEYS.productRecipe],
        onSuccess: () => resetProductRecipeForm(),
        onQueued: () => resetProductRecipeForm(),
      });
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
      await runQueueableMutation({
        url: addonRecipeId ? `/api/owner/inventory/recipes/addons/${addonRecipeId}` : '/api/owner/inventory/recipes/addons',
        method: addonRecipeId ? 'PATCH' : 'POST',
        body: {
          menuAddonId: addonRecipeForm.menuAddonId,
          inventoryItemId: addonRecipeForm.inventoryItemId,
          quantityPerUnit: addonRecipeForm.quantityPerUnit,
          wastagePercent: addonRecipeForm.wastagePercent || 0,
          notes: addonRecipeForm.notes,
          isActive: selectedAddonRecipe?.isActive ?? true,
        },
        successMessage: addonRecipeId ? 'تم تحديث وصفة الإضافة.' : 'تمت إضافة وصفة الإضافة.',
        queuedMessage: addonRecipeId ? 'تم حفظ تعديل وصفة الإضافة في الطابور المحلي.' : 'تم حفظ وصفة الإضافة في الطابور المحلي.',
        failureCode: addonRecipeId ? 'INVENTORY_ADDON_RECIPE_UPDATE_FAILED' : 'INVENTORY_ADDON_RECIPE_CREATE_FAILED',
        invalidateTags: [OPS_CACHE_TAGS.inventory],
        clearDraftKeys: [INVENTORY_DRAFT_KEYS.addonRecipe],
        onSuccess: () => resetAddonRecipeForm(),
        onQueued: () => resetAddonRecipeForm(),
      });
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

  async function submitStructuredOptions() {
    setBusy(true);
    setMessage(null);
    try {
      await runQueueableMutation({
        url: '/api/owner/inventory/recipes/addons/bulk',
        body: {
          inventoryItemId: structuredItemId,
          rows: structuredOptionRows.map((row) => ({
            menuAddonId: row.menuAddonId || null,
            quantityPerUnit: row.quantityPerUnit || 0,
            notes: row.notes || row.label,
          })),
        },
        successMessage: (payload) => `تم حفظ ${payload.result?.applied ?? 0} وصفة منظمة.`,
        queuedMessage: 'تم حفظ الوصفات المنظمة في الطابور المحلي.',
        failureCode: 'INVENTORY_STRUCTURED_OPTIONS_FAILED',
        invalidateTags: [OPS_CACHE_TAGS.inventory],
        clearDraftKeys: [INVENTORY_DRAFT_KEYS.structuredBundle, INVENTORY_DRAFT_KEYS.structuredItem, INVENTORY_DRAFT_KEYS.structuredRows],
        onSuccess: () => {
          structuredBundleDraft.restoreDraft(INVENTORY_STRUCTURED_OPTION_BUNDLES[0]?.key ?? 'sugar-levels');
          structuredItemDraft.restoreDraft('');
          structuredRowsDraft.restoreDraft(createStructuredOptionRows(INVENTORY_STRUCTURED_OPTION_BUNDLES[0]?.key ?? 'sugar-levels'));
        },
        onQueued: () => {
          structuredBundleDraft.restoreDraft(INVENTORY_STRUCTURED_OPTION_BUNDLES[0]?.key ?? 'sugar-levels');
          structuredItemDraft.restoreDraft('');
          structuredRowsDraft.restoreDraft(createStructuredOptionRows(INVENTORY_STRUCTURED_OPTION_BUNDLES[0]?.key ?? 'sugar-levels'));
        },
      });
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
              <div className={opsSectionTitle}>المخزن</div>
              <div className={[opsSectionHint, 'mt-1'].join(' ')}>قسّمنا المخزن إلى مسار يومي واضح، مع بقاء الإعدادات المتقدمة متاحة عند الحاجة.</div>
            </div>
            <div className={opsBadge('accent')}>المرحلة 5</div>
          </div>
          {message ? <div className={[opsAlert(message.includes('تم') || message.includes('محلي') || message.includes('الطابور') ? 'success' : 'danger'), 'mt-3'].join(' ')}>{message}</div> : null}
          {inventoryWorkspace.usingSnapshotFallback ? <div className={[opsAlert('warning'), 'mt-3'].join(' ')}>أنت ترى آخر workspace محفوظ محليًا{inventoryWorkspace.snapshotLoadedAt ? ` • ${formatDateTime(new Date(inventoryWorkspace.snapshotLoadedAt).toISOString())}` : ''}.</div> : null}
          <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <div className={opsMetricCard('accent')}>
              <div className="text-xs opacity-80">الخامات</div>
              <div className="mt-2 text-2xl font-black">{stats.totalItems}</div>
            </div>
            <div className={opsMetricCard('warning')}>
              <div className="text-xs opacity-80">تحتاج متابعة</div>
              <div className="mt-2 text-2xl font-black">{criticalItems.length}</div>
            </div>
            <div className={opsMetricCard('info')}>
              <div className="text-xs opacity-80">الموردون</div>
              <div className="mt-2 text-2xl font-black">{stats.suppliers}</div>
            </div>
            <div className={opsMetricCard('success')}>
              <div className="text-xs opacity-80">الوصفات النشطة</div>
              <div className="mt-2 text-2xl font-black">{stats.productRecipes + stats.addonRecipes}</div>
            </div>
          </div>
        </div>

        <section className={[opsSurface, 'p-3'].join(' ')}>
          <div className="flex flex-wrap justify-end gap-2">
            {INVENTORY_VIEWS.map((view) => (
              <button
                key={view.key}
                type="button"
                className={inventoryView === view.key ? opsAccentButton : opsGhostButton}
                onClick={() => setInventoryView(view.key)}
              >
                <span>{view.label}</span>
                <span className="text-[11px] opacity-80">{view.hint}</span>
              </button>
            ))}
          </div>
        </section>

        {inventoryView === 'daily' ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.12fr)_minmax(340px,0.88fr)] xl:items-start">
            <div className="space-y-4">
              <section className={[opsSurface, 'p-4'].join(' ')}>
                <div className="text-right">
                  <div className={opsSectionTitle}>ابدأ اليوم</div>
                  <div className={[opsSectionHint, 'mt-1'].join(' ')}>1) أضف الوارد  2) اعمل جردًا سريعًا  3) راجع العناصر المنخفضة.</div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {INVENTORY_ITEM_TEMPLATES.map((template) => (
                    <button
                      key={template.key}
                      type="button"
                      className={[opsInset, 'p-4 text-right transition hover:-translate-y-0.5 hover:shadow-md'].join(' ')}
                      onClick={() => {
                        applyItemTemplate(template);
                        setInventoryView('items');
                      }}
                    >
                      <div className="text-sm font-bold text-[#1e1712]">{template.title}</div>
                      <div className="mt-1 text-xs leading-6 text-[#6b5a4c]">{template.description}</div>
                    </button>
                  ))}
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className={[opsInset, 'p-3 text-right'].join(' ')}>
                    <div className="text-sm font-bold text-[#1e1712]">الوارد</div>
                    <div className="mt-1 text-xs leading-6 text-[#6b5a4c]">سجّل الشراء بوحدة الشراء أو التشغيل، والنظام يحوّل تلقائيًا.</div>
                  </div>
                  <div className={[opsInset, 'p-3 text-right'].join(' ')}>
                    <div className="text-sm font-bold text-[#1e1712]">الجرد</div>
                    <div className="mt-1 text-xs leading-6 text-[#6b5a4c]">ادخل العدد الفعلي فقط، وسيتم احتساب فرق التسوية مباشرة.</div>
                  </div>
                  <div className={[opsInset, 'p-3 text-right'].join(' ')}>
                    <div className="text-sm font-bold text-[#1e1712]">السكر والمتغيرات</div>
                    <div className="mt-1 text-xs leading-6 text-[#6b5a4c]">حوّل المتغيرات إلى إضافات منظمة حتى يقترب الاستهلاك من الواقع.</div>
                  </div>
                </div>
              </section>

              <section className={[opsSurface, 'p-4'].join(' ')}>
                <div className={opsSectionTitle}>تسجيل حركة اليوم</div>
                <div className={[opsSectionHint, 'mt-1'].join(' ')}>الوارد يمكن إدخاله بوحدة الشراء أو التشغيل. الصرف والهالك والتسوية بوحدة التشغيل.</div>
                <div className="mt-4 grid gap-2">
                  <select className={opsSelect} value={movementForm.inventoryItemId} onChange={(e) => setMovementForm((current) => ({ ...current, inventoryItemId: e.target.value }))}>
                    <option value="">اختر الخامة</option>
                    {prioritizedItems.filter((item) => item.isActive).map((item) => (
                      <option key={item.id} value={item.id}>{item.itemName}</option>
                    ))}
                  </select>
                  {selectedMovementItem ? <div className={[opsInset, 'p-3 text-right text-xs text-[#6b5a4c]'].join(' ')}>{formatItemUnitSummary(selectedMovementItem)}</div> : null}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <select className={opsSelect} value={movementForm.movementKind} onChange={(e) => setMovementForm((current) => ({ ...current, movementKind: e.target.value as InventoryMovement['movementKind'] }))}>
                      <option value="inbound">وارد</option>
                      <option value="outbound">صرف</option>
                      <option value="waste">هالك</option>
                      <option value="adjustment">تسوية</option>
                    </select>
                    <input className={opsInput} inputMode="decimal" placeholder={movementForm.movementKind === 'inbound' && movementForm.entryUnit === 'purchase' && selectedMovementItem?.purchaseUnitLabel ? `الكمية بـ ${selectedMovementItem.purchaseUnitLabel}` : `الكمية بـ ${selectedMovementItem?.unitLabel ?? 'الوحدة'}`} value={movementForm.quantity} onChange={(e) => setMovementForm((current) => ({ ...current, quantity: e.target.value }))} />
                  </div>
                  {movementForm.movementKind === 'inbound' && selectedMovementItem?.purchaseUnitLabel ? (
                    <select className={opsSelect} value={movementForm.entryUnit} onChange={(e) => setMovementForm((current) => ({ ...current, entryUnit: e.target.value as 'stock' | 'purchase' }))}>
                      <option value="stock">الإدخال بوحدة التشغيل ({selectedMovementItem.unitLabel})</option>
                      <option value="purchase">الإدخال بوحدة الشراء ({selectedMovementItem.purchaseUnitLabel})</option>
                    </select>
                  ) : null}
                  {movementPreview ? (
                    <div className={[opsInset, 'p-3 text-right text-xs leading-6 text-[#6b5a4c]'].join(' ')}>
                      المعاينة: {formatQty(Number(movementForm.quantity || 0))} {movementPreview.inputUnitLabel} = {formatQty(movementPreview.stockQuantity)} {movementPreview.stockUnitLabel}
                    </div>
                  ) : null}
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
                <div className={opsSectionTitle}>آخر الحركات</div>
                <div className={[opsSectionHint, 'mt-1'].join(' ')}>تابع آخر ما دخل وخرج من المخزن.</div>
                <div className="mt-4 space-y-3">
                  {workspace.recentMovements.slice(0, 12).map((movement) => (
                    <article key={movement.id} className={[opsInset, 'p-4'].join(' ')}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-right">
                          <div className="text-sm font-bold text-[#1e1712]">{movement.itemName}</div>
                          <div className="mt-1 text-xs text-[#7d6a59]">{formatDateTime(movement.occurredAt)}</div>
                        </div>
                        <div className={opsBadge(movementTone(movement.movementKind))}>{movementLabel(movement.movementKind)}</div>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="text-sm font-black text-[#1e1712]">{movement.deltaQuantity > 0 ? '+' : ''}{formatQty(movement.deltaQuantity)} {movement.unitLabel}</div>
                        <div className="text-right text-xs text-[#7d6a59]">{movement.supplierName ? `المورد: ${movement.supplierName}` : movement.notes ?? '—'}</div>
                      </div>
                    </article>
                  ))}
                  {!workspace.recentMovements.length ? <div className={[opsInset, 'p-4 text-right text-sm text-[#6b5a4c]'].join(' ')}>لا توجد حركات بعد.</div> : null}
                </div>
              </section>

              <section className={[opsSurface, 'p-4'].join(' ')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="text-right">
                    <div className={opsSectionTitle}>سناب شوت استهلاك الورديات</div>
                    <div className={[opsSectionHint, 'mt-1'].join(' ')}>ملخص مغلق أو معاينة محفوظة من الوردية. الوردية المقفلة يمكن ترحيلها مرة واحدة إلى المخزن.</div>
                  </div>
                  <div className={opsBadge('info')}>Snapshot</div>
                </div>
                <div className="mt-4 space-y-3">
                  {workspace.recentShiftSnapshots.map((snapshot) => (
                    <article key={snapshot.id} className={[opsInset, 'p-4'].join(' ')}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-right">
                          <div className="text-sm font-bold text-[#1e1712]">{snapshot.shiftKind === 'morning' ? 'صباحية' : snapshot.shiftKind === 'evening' ? 'مسائية' : snapshot.shiftKind ?? 'وردية'} • {snapshot.businessDate ?? '—'}</div>
                          <div className="mt-1 text-xs text-[#7d6a59]">{formatDateTime(snapshot.generatedAt)}</div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <div className={opsBadge(snapshot.snapshotPhase === 'closed' ? 'success' : 'warning')}>{snapshot.snapshotPhase === 'closed' ? 'مقفلة' : 'معاينة'}</div>
                          <div className={opsBadge(snapshot.posting.isPosted ? 'accent' : 'info')}>
                            {snapshot.posting.isPosted ? 'مرحل للمخزن' : 'غير مرحل'}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-right text-xs text-[#6b5a4c] sm:grid-cols-4 xl:grid-cols-6">
                        <div className={[opsInset, 'p-3'].join(' ')}>
                          <div>إجمالي الاستهلاك</div>
                          <div className="mt-1 text-base font-black text-[#1e1712]">{formatQty(snapshot.summary.totalConsumptionQty)}</div>
                        </div>
                        <div className={[opsInset, 'p-3'].join(' ')}>
                          <div>من المنتجات</div>
                          <div className="mt-1 text-base font-black text-[#1e1712]">{formatQty(snapshot.summary.productConsumptionQty)}</div>
                        </div>
                        <div className={[opsInset, 'p-3'].join(' ')}>
                          <div>من الإضافات</div>
                          <div className="mt-1 text-base font-black text-[#1e1712]">{formatQty(snapshot.summary.addonConsumptionQty)}</div>
                        </div>
                        <div className={[opsInset, 'p-3'].join(' ')}>
                          <div>Remake</div>
                          <div className="mt-1 text-base font-black text-[#1e1712]">{formatQty(snapshot.summary.remakeWasteQty)} / {formatQty(snapshot.summary.remakeReplacementQty)}</div>
                        </div>
                        <div className={[opsInset, 'p-3'].join(' ')}>
                          <div>الترحيل</div>
                          <div className="mt-1 text-base font-black text-[#1e1712]">{snapshot.posting.isPosted ? formatQty(snapshot.posting.totalConsumptionQty) : '—'}</div>
                        </div>
                        <div className={[opsInset, 'p-3'].join(' ')}>
                          <div>وقت الترحيل</div>
                          <div className="mt-1 text-xs font-bold text-[#1e1712]">{snapshot.posting.postedAt ? formatDateTime(snapshot.posting.postedAt) : 'غير مرحل'}</div>
                        </div>
                      </div>
                      {snapshot.snapshotPhase === 'closed' && !snapshot.posting.isPosted ? (
                        <div className="mt-3 flex justify-start">
                          <button
                            type="button"
                            className={opsAccentButton}
                            onClick={() => void postShiftSnapshot(snapshot.shiftId)}
                            disabled={postingBusyFor === snapshot.shiftId}
                          >
                            {postingBusyFor === snapshot.shiftId ? '...' : 'ترحيل هذه الوردية للمخزن'}
                          </button>
                        </div>
                      ) : null}
                      <div className="mt-3 space-y-2">
                        {snapshot.lines.slice(0, 5).map((line) => (
                          <div key={`${snapshot.id}-${line.inventoryItemId}`} className="flex items-center justify-between gap-3 rounded-2xl border border-[#eadfce] bg-[#fffaf3] px-3 py-2 text-right text-xs text-[#6b5a4c]">
                            <div>
                              <div className="font-bold text-[#1e1712]">{line.itemName}</div>
                              <div className="mt-1">منتج {formatQty(line.fromProducts)} • إضافات {formatQty(line.fromAddons)}</div>
                            </div>
                            <div className="text-left">
                              <div className="font-black text-[#1e1712]">{formatQty(line.totalConsumption)} {line.unitLabel}</div>
                              <div className="mt-1">هالك {formatQty(line.remakeWasteQty)} • جديد {formatQty(line.remakeReplacementQty)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {!snapshot.lines.length ? <div className="mt-3 text-right text-xs text-[#7d6a59]">لا توجد خامات مرتبطة بوصفات في هذه الوردية.</div> : null}
                    </article>
                  ))}
                  {!workspace.recentShiftSnapshots.length ? <div className={[opsInset, 'p-4 text-right text-sm text-[#6b5a4c]'].join(' ')}>لن تظهر السناب شوت هنا إلا بعد تطبيق migration الجديدة وتقفيل وردية أو بناء معاينة لها.</div> : null}
                </div>
              </section>
            </div>

            <div className="space-y-4 xl:sticky xl:top-24">
              <section className={[opsSurface, 'p-4'].join(' ')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="text-right">
                    <div className={opsSectionTitle}>جرد سريع</div>
                    <div className={[opsSectionHint, 'mt-1'].join(' ')}>اختر خامة، اكتب العدد الفعلي، والنظام يحسب فرق التسوية.</div>
                  </div>
                  <div className={opsBadge('info')}>أسرع إجراء</div>
                </div>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  {quickCountFocusItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={item.id === quickCountForm.inventoryItemId ? opsAccentButton : opsGhostButton}
                      onClick={() => setQuickCountForm((current) => ({ ...current, inventoryItemId: item.id }))}
                    >
                      {item.itemName}
                    </button>
                  ))}
                </div>
                <div className="mt-4 grid gap-2">
                  <select className={opsSelect} value={quickCountForm.inventoryItemId} onChange={(e) => setQuickCountForm((current) => ({ ...current, inventoryItemId: e.target.value }))}>
                    <option value="">اختر الخامة</option>
                    {workspace.items.filter((item) => item.isActive).map((item) => (
                      <option key={item.id} value={item.id}>{item.itemName}</option>
                    ))}
                  </select>
                  {selectedQuickCountItem ? (
                    <div className={[opsInset, 'p-3 text-right text-xs leading-6 text-[#6b5a4c]'].join(' ')}>
                      المتوقع الآن: {formatQty(selectedQuickCountItem.currentBalance)} {selectedQuickCountItem.unitLabel}
                      <div className="mt-1">{formatItemUnitSummary(selectedQuickCountItem)}</div>
                    </div>
                  ) : null}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input className={opsInput} inputMode="decimal" placeholder={quickCountForm.entryUnit === 'purchase' && selectedQuickCountItem?.purchaseUnitLabel ? `العدد الفعلي بـ ${selectedQuickCountItem.purchaseUnitLabel}` : `العدد الفعلي بـ ${selectedQuickCountItem?.unitLabel ?? 'الوحدة'}`} value={quickCountForm.actualQuantity} onChange={(e) => setQuickCountForm((current) => ({ ...current, actualQuantity: e.target.value }))} />
                    {selectedQuickCountItem?.purchaseUnitLabel ? (
                      <select className={opsSelect} value={quickCountForm.entryUnit} onChange={(e) => setQuickCountForm((current) => ({ ...current, entryUnit: e.target.value as 'stock' | 'purchase' }))}>
                        <option value="stock">الجرد بوحدة التشغيل ({selectedQuickCountItem.unitLabel})</option>
                        <option value="purchase">الجرد بوحدة الشراء ({selectedQuickCountItem.purchaseUnitLabel})</option>
                      </select>
                    ) : <div className={[opsInset, 'p-3 text-right text-xs text-[#6b5a4c]'].join(' ')}>الجرد سيتم بوحدة التشغيل فقط.</div>}
                  </div>
                  {quickCountPreview && selectedQuickCountItem ? (
                    <div className={[opsInset, 'p-3 text-right text-xs leading-6 text-[#6b5a4c]'].join(' ')}>
                      الفعلي بعد التحويل: {formatQty(quickCountPreview.stockQuantity)} {quickCountPreview.stockUnitLabel}
                      <div className="mt-1">فرق الجرد: {quickCountVariance && quickCountVariance > 0 ? '+' : ''}{formatQty(Number(quickCountVariance ?? 0))} {quickCountPreview.stockUnitLabel}</div>
                    </div>
                  ) : null}
                  <textarea className={[opsInput, 'min-h-[72px] resize-y'].join(' ')} placeholder="ملاحظة الجرد - اختياري" value={quickCountForm.notes} onChange={(e) => setQuickCountForm((current) => ({ ...current, notes: e.target.value }))} />
                </div>
                <button type="button" className={[opsAccentButton, 'mt-3 w-full'].join(' ')} onClick={submitQuickCount} disabled={busy || !quickCountForm.inventoryItemId || !quickCountForm.actualQuantity.trim()}>
                  {busy ? '...' : 'حفظ الجرد السريع'}
                </button>
              </section>

              <section className={[opsSurface, 'p-4'].join(' ')}>
                <div className={opsSectionTitle}>تحتاج متابعة الآن</div>
                <div className={[opsSectionHint, 'mt-1'].join(' ')}>هذه العناصر المنخفضة أو المنتهية أول ما تحتاجه اليوم.</div>
                <div className="mt-4 space-y-3">
                  {prioritizedItems.slice(0, 10).map((item) => (
                    <article key={item.id} className={[opsInset, 'p-4'].join(' ')}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-right">
                          <div className="text-base font-bold text-[#1e1712]">{item.itemName}</div>
                          <div className="mt-1 text-xs text-[#7d6a59]">{formatItemUnitSummary(item)}</div>
                        </div>
                        <div className={opsBadge(stockTone(item.stockStatus))}>{stockLabel(item.stockStatus)}</div>
                      </div>
                      <div className="mt-3 flex items-end justify-between gap-3">
                        <div className="text-right">
                          <div className="text-xs text-[#7d6a59]">الرصيد</div>
                          <div className="mt-1 text-2xl font-black text-[#1e1712]">{formatQty(item.currentBalance)}</div>
                        </div>
                        <div className="text-right text-xs text-[#7d6a59]">
                          <div>حد التنبيه: {formatQty(item.lowStockThreshold)} {item.unitLabel}</div>
                          <div className="mt-1">آخر حركة: {formatDateTime(item.lastMovementAt)}</div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <button type="button" className={opsGhostButton} onClick={() => {
                          startEditItem(item);
                          setInventoryView('items');
                        }}>تعديل الخامة</button>
                        <button type="button" className={opsAccentButton} onClick={() => setMovementForm((current) => ({ ...current, inventoryItemId: item.id, movementKind: 'inbound' }))}>وارد سريع</button>
                      </div>
                    </article>
                  ))}
                  {!prioritizedItems.length ? <div className={[opsInset, 'p-4 text-right text-sm text-[#6b5a4c]'].join(' ')}>لا توجد خامات تحتاج متابعة الآن.</div> : null}
                </div>
              </section>
            </div>
          </div>
        ) : null}

        {inventoryView === 'items' ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] xl:items-start">
            <div className="space-y-4">
              <section className={[opsSurface, 'p-4'].join(' ')}>
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="text-right">
                    <div className={opsSectionTitle}>الخامات</div>
                    <div className={[opsSectionHint, 'mt-1'].join(' ')}>ابحث وعدّل الرصيد والوحدات والخامات النشطة.</div>
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
                          <div>{formatItemUnitSummary(item)}</div>
                          <div className="mt-1">حد التنبيه: {formatQty(item.lowStockThreshold)} {item.unitLabel}</div>
                          <div className="mt-1">آخر حركة: {formatDateTime(item.lastMovementAt)}</div>
                        </div>
                      </div>
                      {item.notes ? <div className="mt-3 text-right text-xs leading-6 text-[#6b5a4c]">{item.notes}</div> : null}
                      <div className="mt-4 flex flex-wrap justify-end gap-2">
                        <button type="button" className={opsGhostButton} onClick={() => toggleItem(item)} disabled={busy}>{item.isActive ? 'إيقاف' : 'تفعيل'}</button>
                        <button type="button" className={opsAccentButton} onClick={() => startEditItem(item)} disabled={busy}>تعديل</button>
                      </div>
                    </article>
                  ))}
                  {!filteredItems.length ? <div className={[opsInset, 'p-4 text-right text-sm text-[#6b5a4c] xl:col-span-2'].join(' ')}>لا توجد خامات مطابقة.</div> : null}
                </div>
              </section>
            </div>

            <div className="space-y-4 xl:sticky xl:top-24">
              <section className={[opsSurface, 'p-4'].join(' ')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="text-right">
                    <div className={opsSectionTitle}>{itemId ? 'تعديل خامة' : 'إضافة خامة'}</div>
                    <div className={[opsSectionHint, 'mt-1'].join(' ')}>عرّف وحدة التشغيل أولاً ثم وحدة الشراء إذا اختلفت.</div>
                  </div>
                  {itemId ? <button type="button" className={opsGhostButton} onClick={resetItemForm}>جديد</button> : null}
                </div>
                {!itemId ? (
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    {INVENTORY_ITEM_TEMPLATES.map((template) => (
                      <button key={template.key} type="button" className={opsGhostButton} onClick={() => applyItemTemplate(template)}>
                        {template.title}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <input className={opsInput} placeholder="اسم الخامة" value={itemForm.itemName} onChange={(e) => setItemForm((current) => ({ ...current, itemName: e.target.value }))} />
                  <input className={opsInput} placeholder="كود داخلي" value={itemForm.itemCode} onChange={(e) => setItemForm((current) => ({ ...current, itemCode: e.target.value }))} />
                  <input className={opsInput} placeholder="التصنيف" value={itemForm.categoryLabel} onChange={(e) => setItemForm((current) => ({ ...current, categoryLabel: e.target.value }))} />
                  <input className={opsInput} placeholder="وحدة التشغيل (مثال: ملعقة / قطعة)" value={itemForm.unitLabel} onChange={(e) => setItemForm((current) => ({ ...current, unitLabel: e.target.value }))} />
                  <input className={opsInput} placeholder="وحدة الشراء - اختياري (مثال: كيلو / علبة)" value={itemForm.purchaseUnitLabel} onChange={(e) => setItemForm((current) => ({ ...current, purchaseUnitLabel: e.target.value, openingBalanceUnit: e.target.value.trim() ? current.openingBalanceUnit : 'stock' }))} />
                  <input className={opsInput} inputMode="decimal" placeholder="1 وحدة شراء = كم وحدة تشغيل" value={itemForm.purchaseToStockFactor} onChange={(e) => setItemForm((current) => ({ ...current, purchaseToStockFactor: e.target.value }))} disabled={!itemForm.purchaseUnitLabel.trim()} />
                  <input className={opsInput} inputMode="decimal" placeholder="حد التنبيه" value={itemForm.lowStockThreshold} onChange={(e) => setItemForm((current) => ({ ...current, lowStockThreshold: e.target.value }))} />
                  {!itemId ? <input className={opsInput} inputMode="decimal" placeholder="رصيد افتتاحي" value={itemForm.openingBalance} onChange={(e) => setItemForm((current) => ({ ...current, openingBalance: e.target.value }))} /> : null}
                </div>
                {!itemId && itemForm.purchaseUnitLabel.trim() ? (
                  <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px]">
                    <div className={[opsInset, 'p-3 text-right text-xs leading-6 text-[#6b5a4c]'].join(' ')}>
                      {openingBalancePreview
                        ? `المعاينة: ${formatQty(Number(itemForm.openingBalance || 0))} ${itemForm.openingBalanceUnit === 'purchase' ? itemForm.purchaseUnitLabel : itemForm.unitLabel} = ${formatQty(openingBalancePreview.stockQuantity)} ${itemForm.unitLabel}`
                        : 'يمكنك إدخال الرصيد الافتتاحي بوحدة التشغيل أو بوحدة الشراء.'}
                    </div>
                    <select className={opsSelect} value={itemForm.openingBalanceUnit} onChange={(e) => setItemForm((current) => ({ ...current, openingBalanceUnit: e.target.value as 'stock' | 'purchase' }))}>
                      <option value="stock">الرصيد بوحدة التشغيل</option>
                      <option value="purchase">الرصيد بوحدة الشراء</option>
                    </select>
                  </div>
                ) : null}
                <textarea className={[opsInput, 'mt-2 min-h-[96px] resize-y'].join(' ')} placeholder="ملاحظات" value={itemForm.notes} onChange={(e) => setItemForm((current) => ({ ...current, notes: e.target.value }))} />
                <button type="button" className={[opsAccentButton, 'mt-3 w-full'].join(' ')} onClick={submitItem} disabled={busy || !itemForm.itemName.trim() || !itemForm.unitLabel.trim() || (Boolean(itemForm.purchaseUnitLabel.trim()) && !itemForm.purchaseToStockFactor.trim())}>
                  {busy ? '...' : itemId ? 'حفظ التعديل' : 'إضافة الخامة'}
                </button>
              </section>
            </div>
          </div>
        ) : null}

        {inventoryView === 'recipes' ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.18fr)_minmax(360px,0.82fr)] xl:items-start">
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
                    <div className={opsSectionTitle}>خيارات منظمة مؤثرة في الاستهلاك</div>
                    <div className={[opsSectionHint, 'mt-1'].join(' ')}>مثالية للسكر أو أي متغير يغيّر استهلاك الخامة من طلب لآخر.</div>
                  </div>
                  <div className={opsBadge('info')}>سريع</div>
                </div>
                <div className="mt-4 grid gap-2">
                  <select className={opsSelect} value={structuredBundleKey} onChange={(e) => setStructuredBundleKey(e.target.value)}>
                    {INVENTORY_STRUCTURED_OPTION_BUNDLES.map((bundle) => (
                      <option key={bundle.key} value={bundle.key}>{bundle.title}</option>
                    ))}
                  </select>
                  <div className={[opsInset, 'p-3 text-right text-xs leading-6 text-[#6b5a4c]'].join(' ')}>{selectedStructuredBundle?.description ?? 'اختر قالبًا منظمًا ثم اربطه بإضافات المنيو.'}</div>
                  <select className={opsSelect} value={structuredItemId} onChange={(e) => setStructuredItemId(e.target.value)}>
                    <option value="">اختر الخامة المرتبطة</option>
                    {workspace.items.filter((item) => item.isActive).map((item) => (
                      <option key={item.id} value={item.id}>{item.itemName}</option>
                    ))}
                  </select>
                  {selectedStructuredItem ? <div className={[opsInset, 'p-3 text-right text-xs text-[#6b5a4c]'].join(' ')}>{formatItemUnitSummary(selectedStructuredItem)}</div> : null}
                </div>
                <div className="mt-3 space-y-2">
                  {structuredOptionRows.map((row, index) => (
                    <div key={row.key} className={[opsInset, 'p-3'].join(' ')}>
                      <div className="grid gap-2 md:grid-cols-[100px_minmax(0,1fr)_minmax(0,1fr)]">
                        <input className={opsInput} inputMode="decimal" placeholder="الكمية" value={row.quantityPerUnit} onChange={(e) => setStructuredOptionRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, quantityPerUnit: e.target.value } : item))} />
                        <select className={opsSelect} value={row.menuAddonId} onChange={(e) => setStructuredOptionRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, menuAddonId: e.target.value } : item))}>
                          <option value="">اختر إضافة المنيو</option>
                          {workspace.menuAddons.filter((item) => item.isActive).map((item) => (
                            <option key={item.id} value={item.id}>{item.name}</option>
                          ))}
                        </select>
                        <div className="flex items-center justify-end text-sm font-bold text-[#1e1712]">{row.label}</div>
                      </div>
                      <input className={[opsInput, 'mt-2'].join(' ')} placeholder="ملاحظة اختيارية" value={row.notes} onChange={(e) => setStructuredOptionRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, notes: e.target.value } : item))} />
                      {Number(row.quantityPerUnit || 0) <= 0 ? <div className="mt-2 text-right text-[11px] text-[#7d6a59]">هذه الكمية = 0، سيتم تجاهل الصف عند الحفظ.</div> : null}
                    </div>
                  ))}
                </div>
                <button type="button" className={[opsAccentButton, 'mt-3 w-full'].join(' ')} onClick={submitStructuredOptions} disabled={busy || !structuredItemId || !structuredOptionRows.some((row) => row.menuAddonId && Number(row.quantityPerUnit || 0) > 0)}>
                  {busy ? '...' : 'حفظ الخيارات المنظمة'}
                </button>
              </section>
            </div>
          </div>
        ) : null}

        {inventoryView === 'suppliers' ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.9fr)] xl:items-start">
            <div className="space-y-4">
              <section className={[opsSurface, 'p-4'].join(' ')}>
                <div className={opsSectionTitle}>آخر وارد من الموردين</div>
                <div className={[opsSectionHint, 'mt-1'].join(' ')}>راجع آخر التوريدات المسجلة والجهة التي وردت منها.</div>
                <div className="mt-4 space-y-3">
                  {recentInboundMovements.map((movement) => (
                    <article key={movement.id} className={[opsInset, 'p-4'].join(' ')}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-right">
                          <div className="text-sm font-bold text-[#1e1712]">{movement.itemName}</div>
                          <div className="mt-1 text-xs text-[#7d6a59]">{formatDateTime(movement.occurredAt)}</div>
                        </div>
                        <div className={opsBadge('success')}>{movement.supplierName ?? 'بدون مورد'}</div>
                      </div>
                      <div className="mt-3 text-right text-sm font-black text-[#1e1712]">+{formatQty(movement.deltaQuantity)} {movement.unitLabel}</div>
                    </article>
                  ))}
                  {!recentInboundMovements.length ? <div className={[opsInset, 'p-4 text-right text-sm text-[#6b5a4c]'].join(' ')}>لا توجد توريدات واردة مسجلة بعد.</div> : null}
                </div>
              </section>
            </div>

            <div className="space-y-4 xl:sticky xl:top-24">
              <section className={[opsSurface, 'p-4'].join(' ')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="text-right">
                    <div className={opsSectionTitle}>{supplierId ? 'تعديل مورد' : 'إضافة مورد'}</div>
                    <div className={[opsSectionHint, 'mt-1'].join(' ')}>احتفظ بموردي البن والسكر والخامات الرئيسية هنا.</div>
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
        ) : null}

        {inventoryView === 'analysis' ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(340px,0.92fr)] xl:items-start">
            <div className="space-y-4">
              <section className={[opsSurface, 'p-4'].join(' ')}>
                <div className={opsSectionTitle}>قراءة الفرق والغطاء</div>
                <div className={[opsSectionHint, 'mt-1'].join(' ')}>اعرف ما الذي سينفد وما الفرق بين الاستهلاك المتوقع والصرف المسجل.</div>
                <div className="mt-4 grid gap-3 xl:grid-cols-2">
                  {criticalConsumptionRows.map((row) => (
                    <article key={row.inventoryItemId} className={[opsInset, 'p-4'].join(' ')}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-right">
                          <div className="text-base font-bold text-[#1e1712]">{row.itemName}</div>
                          <div className="mt-1 text-xs text-[#7d6a59]">{row.unitLabel}</div>
                        </div>
                        <div className={opsBadge(coverageTone(row))}>{coverageLabel(row)}</div>
                      </div>
                      <div className="mt-3 text-right text-xs text-[#6b5a4c] leading-6">
                        <div>الرصيد الحالي: {formatQty(row.currentBalance)}</div>
                        <div>الاستهلاك التقديري: {formatQty(row.estimatedTotal)}</div>
                        <div>الصرف المسجل: {formatQty(row.recordedOutflow)}</div>
                        <div>فرق القراءة: {row.varianceQuantity > 0 ? '+' : ''}{formatQty(row.varianceQuantity)}</div>
                      </div>
                    </article>
                  ))}
                  {!criticalConsumptionRows.length ? <div className={[opsInset, 'p-4 text-right text-sm text-[#6b5a4c] xl:col-span-2'].join(' ')}>لا توجد فروقات حرجة حاليًا.</div> : null}
                </div>
              </section>

              <section className={[opsSurface, 'p-4'].join(' ')}>
                <div className={opsSectionTitle}>كل الحركات</div>
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
                          {movement.inputUnitLabel && movement.inputUnitLabel !== movement.unitLabel ? (
                            <div className="mt-1 text-[11px] font-medium text-[#7d6a59]">
                              إدخال: {formatQty(movement.inputQuantity ?? Math.abs(movement.deltaQuantity))} {movement.inputUnitLabel}
                              {movement.conversionFactor && movement.conversionFactor !== 1 ? ` × ${formatQty(movement.conversionFactor)}` : ''}
                            </div>
                          ) : null}
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
                <div className={opsSectionTitle}>ملخص سريع</div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className={opsMetricCard('warning')}>
                    <div className="text-xs opacity-80">منخفضة</div>
                    <div className="mt-2 text-2xl font-black">{stats.lowStock}</div>
                  </div>
                  <div className={opsMetricCard('danger')}>
                    <div className="text-xs opacity-80">نفدت</div>
                    <div className="mt-2 text-2xl font-black">{stats.emptyStock}</div>
                  </div>
                  <div className={opsMetricCard('success')}>
                    <div className="text-xs opacity-80">وصفات منتجات</div>
                    <div className="mt-2 text-2xl font-black">{stats.productRecipes}</div>
                  </div>
                  <div className={opsMetricCard('success')}>
                    <div className="text-xs opacity-80">وصفات إضافات</div>
                    <div className="mt-2 text-2xl font-black">{stats.addonRecipes}</div>
                  </div>
                </div>
              </section>

              <section className={[opsSurface, 'p-4'].join(' ')}>
                <div className={opsSectionTitle}>العناصر الحرجة</div>
                <div className={[opsSectionHint, 'mt-1'].join(' ')}>اضغط على الخامة للانتقال إلى الجرد أو الوارد اليومي.</div>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  {prioritizedItems.slice(0, 12).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={item.stockStatus === 'empty' ? opsAccentButton : opsGhostButton}
                      onClick={() => {
                        setQuickCountForm((current) => ({ ...current, inventoryItemId: item.id }));
                        setMovementForm((current) => ({ ...current, inventoryItemId: item.id, movementKind: 'inbound' }));
                        setInventoryView('daily');
                      }}
                    >
                      {item.itemName}
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </div>
        ) : null}
      </section>
    </MobileShell>
  );
}
