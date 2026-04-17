export type InventoryItemTemplate = {
  key: string;
  title: string;
  description: string;
  itemName: string;
  categoryLabel: string;
  unitLabel: string;
  purchaseUnitLabel: string | null;
  purchaseToStockFactor: number | null;
  lowStockThreshold: number;
  notes: string;
};

export type StructuredOptionBundleRowTemplate = {
  key: string;
  label: string;
  defaultQuantity: number;
  note?: string;
};

export type StructuredOptionBundleTemplate = {
  key: string;
  title: string;
  description: string;
  rows: StructuredOptionBundleRowTemplate[];
};

export const INVENTORY_ITEM_TEMPLATES: InventoryItemTemplate[] = [
  {
    key: 'coffee-beans-spoons',
    title: 'بن: كيلو ⇢ ملعقة',
    description: 'مناسب لو الوصفة عندك بالملاعق والشراء بالكيلو.',
    itemName: 'بن',
    categoryLabel: 'مشروبات ساخنة',
    unitLabel: 'ملعقة',
    purchaseUnitLabel: 'كيلو',
    purchaseToStockFactor: 100,
    lowStockThreshold: 20,
    notes: 'مثال تشغيلي: 1 كيلو = 100 ملعقة.',
  },
  {
    key: 'sugar-spoons',
    title: 'سكر: كيلو ⇢ ملعقة',
    description: 'مناسب لمستويات السكر عبر الإضافات المنظمة.',
    itemName: 'سكر',
    categoryLabel: 'إضافات',
    unitLabel: 'ملعقة',
    purchaseUnitLabel: 'كيلو',
    purchaseToStockFactor: 150,
    lowStockThreshold: 30,
    notes: 'مثال تشغيلي: 1 كيلو = 150 ملعقة.',
  },
  {
    key: 'piece-based-item',
    title: 'خامة بالقطعة',
    description: 'أكواب، فويل، جمر، أو أي خامة لا تحتاج تحويل.',
    itemName: '',
    categoryLabel: 'تشغيل',
    unitLabel: 'قطعة',
    purchaseUnitLabel: null,
    purchaseToStockFactor: null,
    lowStockThreshold: 10,
    notes: 'استخدمه للخامات التي يُحسب استهلاكها مباشرة بالقطعة.',
  },
];

export const INVENTORY_STRUCTURED_OPTION_BUNDLES: StructuredOptionBundleTemplate[] = [
  {
    key: 'sugar-levels',
    title: 'مستويات السكر',
    description: 'اربط إضافات المنيو الخاصة بالسكر بوصفة السكر. الصف الذي كميته 0 لا يحتاج وصفة.',
    rows: [
      { key: 'plain', label: 'سادة', defaultQuantity: 0, note: 'بدون استهلاك سكر.' },
      { key: 'light', label: 'عالريحة', defaultQuantity: 0.5 },
      { key: 'regular', label: 'مظبوط', defaultQuantity: 1 },
      { key: 'medium', label: 'مانو', defaultQuantity: 1.5 },
      { key: 'extra', label: 'زيادة', defaultQuantity: 2 },
    ],
  },
  {
    key: 'blank-five',
    title: 'قالب فارغ 5 صفوف',
    description: 'استخدمه لأي اختيارات منظمة أخرى مثل زيادة البن أو إضافات الشيشة.',
    rows: [
      { key: 'row-1', label: 'اختيار 1', defaultQuantity: 0 },
      { key: 'row-2', label: 'اختيار 2', defaultQuantity: 0 },
      { key: 'row-3', label: 'اختيار 3', defaultQuantity: 0 },
      { key: 'row-4', label: 'اختيار 4', defaultQuantity: 0 },
      { key: 'row-5', label: 'اختيار 5', defaultQuantity: 0 },
    ],
  },
];
