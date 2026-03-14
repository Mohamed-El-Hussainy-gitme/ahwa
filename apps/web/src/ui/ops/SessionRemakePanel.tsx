'use client';

import { useState } from 'react';
import type { SessionOrderItem } from '@/lib/ops/types';

type Props = {
  title: string;
  items: SessionOrderItem[];
  selectedQty: Record<string, number>;
  onChangeQty: (orderItemId: string, nextQty: number, maxQty: number) => void;
  onRemake: (item: SessionOrderItem, quantity: number, notes?: string) => void | Promise<void>;
  busy: boolean;
  emptyLabel: string;
};

export function SessionRemakePanel({
  title,
  items,
  selectedQty,
  onChangeQty,
  onRemake,
  busy,
  emptyLabel,
}: Props) {
  const [expandedByItem, setExpandedByItem] = useState<Record<string, boolean>>({});
  const [notesByItem, setNotesByItem] = useState<Record<string, string>>({});

  async function submitRemake(item: SessionOrderItem, quantity: number) {
    const notes = notesByItem[item.orderItemId]?.trim() || undefined;
    await onRemake(item, quantity, notes);
    setExpandedByItem((state) => ({ ...state, [item.orderItemId]: false }));
    setNotesByItem((state) => ({ ...state, [item.orderItemId]: '' }));
  }

  return (
    <div className="rounded-2xl border border-slate-200 p-3">
      <div className="mb-2 text-sm font-semibold text-slate-700">{title}</div>
      <div className="space-y-2">
        {items.map((item) => {
          const maxQty = item.availableRemakeQty;
          const quantity = Math.max(1, Math.min(selectedQty[item.orderItemId] ?? 1, Math.max(maxQty, 1)));
          const expanded = Boolean(expandedByItem[item.orderItemId]);
          return (
            <div key={item.orderItemId} className="rounded-2xl border border-slate-200 p-3">
              <div className="font-semibold">{item.productName}</div>
              <div className="mt-1 text-xs text-slate-500">
                تم تسليمه {item.qtyDelivered} • بديل مجاني مسلّم {item.qtyReplacementDelivered} • جاهز الآن {item.qtyReadyForDelivery}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                إعادة مجانية متاحة {item.availableRemakeQty} • دُفع {item.qtyPaid} • آجل {item.qtyDeferred} • مُسقط {item.qtyWaived}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <button
                  onClick={() => onChangeQty(item.orderItemId, quantity - 1, Math.max(maxQty, 1))}
                  className="h-10 w-10 rounded-2xl border border-slate-200"
                >
                  -
                </button>
                <div className="text-lg font-bold">{quantity}</div>
                <button
                  onClick={() => onChangeQty(item.orderItemId, quantity + 1, Math.max(maxQty, 1))}
                  className="h-10 w-10 rounded-2xl bg-slate-900 text-white"
                >
                  +
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setExpandedByItem((state) => ({ ...state, [item.orderItemId]: !expanded }))}
                  className={[
                    'rounded-2xl border px-3 py-3 text-sm font-semibold',
                    expanded ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-700',
                  ].join(' ')}
                >
                  {expanded ? 'إخفاء السبب' : 'إضافة سبب'}
                </button>
                <button
                  disabled={busy || maxQty <= 0}
                  onClick={() => void submitRemake(item, quantity)}
                  className="rounded-2xl bg-amber-600 px-3 py-3 font-semibold text-white disabled:opacity-40"
                >
                  إعادة عمل مجانية
                </button>
              </div>
              {expanded ? (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                  <div className="text-xs font-semibold text-amber-800">سبب الإعادة المجانية</div>
                  <textarea
                    value={notesByItem[item.orderItemId] ?? ''}
                    onChange={(event) => setNotesByItem((state) => ({ ...state, [item.orderItemId]: event.target.value }))}
                    rows={2}
                    placeholder="مثال: القهوة باردة أو الطعم غير جيد"
                    className="mt-2 w-full rounded-2xl border border-amber-200 bg-white px-3 py-3 text-right"
                  />
                </div>
              ) : null}
            </div>
          );
        })}
        {!items.length ? <div className="text-sm text-slate-500">{emptyLabel}</div> : null}
      </div>
    </div>
  );
}
