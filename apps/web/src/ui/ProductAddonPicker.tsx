'use client';

import { useEffect, useMemo, useState } from 'react';

export type ProductAddonOption = {
  id: string;
  name: string;
  unitPrice: number;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(value);
}

export function ProductAddonPicker({
  open,
  title,
  options,
  selectedIds,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  options: ProductAddonOption[];
  selectedIds: string[];
  onClose: () => void;
  onSave: (nextIds: string[]) => void;
}) {
  const [draftIds, setDraftIds] = useState<string[]>(selectedIds);

  useEffect(() => {
    if (open) {
      setDraftIds(selectedIds);
    }
  }, [open, selectedIds]);

  const draftSet = useMemo(() => new Set(draftIds), [draftIds]);
  const draftTotal = useMemo(
    () => options.filter((option) => draftSet.has(option.id)).reduce((sum, option) => sum + option.unitPrice, 0),
    [draftSet, options],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-black/35 p-3 sm:items-center">
      <div className="w-full max-w-[min(42rem,calc(100vw-2rem))] rounded-[24px] border border-[#dccbb7] bg-[#fffdf9] p-4 shadow-[0_24px_60px_rgba(30,23,18,0.22)]">
        <div className="text-right">
          <div className="text-base font-black text-[#1e1712]">إضافات {title}</div>
          <div className="mt-1 text-sm text-[#7d6a59]">اختر الإضافات التي تريد احتسابها مع هذا الصنف.</div>
        </div>

        <div className="mt-4">
          {options.length ? <div className="grid gap-2 md:grid-cols-2">{options.map((option) => {
            const active = draftSet.has(option.id);
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setDraftIds((current) => {
                    const set = new Set(current);
                    if (set.has(option.id)) set.delete(option.id);
                    else set.add(option.id);
                    return options.map((item) => item.id).filter((id) => set.has(id));
                  });
                }}
                className={[
                  'flex w-full items-center justify-between rounded-[18px] border px-3 py-3 text-right transition',
                  active ? 'border-[#9b6b2e] bg-[#fff7ea]' : 'border-[#e4d5c3] bg-white',
                ].join(' ')}
              >
                <div>
                  <div className="text-sm font-semibold text-[#1e1712]">{option.name}</div>
                  <div className="mt-1 text-xs text-[#7d6a59]">+ {formatMoney(option.unitPrice)} ج.م</div>
                </div>
                <div className={[
                  'rounded-full px-2 py-1 text-xs font-bold',
                  active ? 'bg-[#9b6b2e] text-white' : 'bg-[#f4ede3] text-[#6a5849]',
                ].join(' ')}>
                  {active ? 'محدد' : 'اختيار'}
                </div>
              </button>
            );
          })}</div> : <div className="rounded-[18px] border border-dashed border-[#d8c7b3] p-3 text-sm text-[#7d6a59]">لا توجد إضافات مرتبطة بهذا الصنف.</div>}
        </div>

        <div className="mt-4 flex items-center justify-between rounded-[18px] bg-[#f8f1e6] px-3 py-2 text-sm">
          <span className="font-semibold text-[#5e4d3f]">إجمالي الإضافات للوحدة</span>
          <strong className="text-[#1e1712]">{formatMoney(draftTotal)} ج.م</strong>
        </div>

        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-[18px] border border-[#d8c7b3] bg-white px-4 py-3 text-sm font-semibold text-[#5e4d3f]">
            إلغاء
          </button>
          <button type="button" onClick={() => onSave(draftIds)} className="flex-1 rounded-[18px] bg-[#1e1712] px-4 py-3 text-sm font-semibold text-white">
            حفظ الإضافات
          </button>
        </div>
      </div>
    </div>
  );
}
