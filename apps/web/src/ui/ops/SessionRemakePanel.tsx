'use client';

import { useState } from 'react';
import type { SessionOrderItem } from '@/lib/ops/types';
import { QuantityStepper } from '@/ui/ops/QuantityStepper';

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
    <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-700">{title}</div>
        {items.length ? <div className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">{items.length}</div> : null}
      </div>

      <div className="space-y-3">
        {items.map((item) => {
          const maxQty = item.availableRemakeQty;
          const quantity = Math.max(1, Math.min(selectedQty[item.orderItemId] ?? 1, Math.max(maxQty, 1)));
          const expanded = Boolean(expandedByItem[item.orderItemId]);

          return (
            <div key={item.orderItemId} className="rounded-3xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 text-right">
                  <div className="text-xs font-semibold text-slate-500">{item.sessionLabel}</div>
                  <div className="mt-1 text-base font-bold text-slate-900">{item.productName}</div>
                </div>

                <div className="rounded-2xl bg-amber-500 px-3 py-2 text-center text-white">
                  <div className="text-[10px] font-semibold text-white/80">إعادة</div>
                  <div className="text-xl font-black leading-none">{item.availableRemakeQty}</div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-700">تم تسليمه {item.qtyDelivered}</span>
                {item.qtyReadyForDelivery > 0 ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">جاهز {item.qtyReadyForDelivery}</span> : null}
                {item.qtyReplacementDelivered > 0 ? <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">بديل {item.qtyReplacementDelivered}</span> : null}
              </div>

              <QuantityStepper
                label="إعادة الآن"
                value={quantity}
                onDecrement={() => onChangeQty(item.orderItemId, quantity - 1, Math.max(maxQty, 1))}
                onIncrement={() => onChangeQty(item.orderItemId, quantity + 1, Math.max(maxQty, 1))}
              />

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
                  type="button"
                  disabled={busy || maxQty <= 0}
                  onClick={() => void submitRemake(item, quantity)}
                  className="rounded-2xl bg-amber-600 px-3 py-3 font-semibold text-white disabled:opacity-40"
                >
                  إعادة عمل مجانية
                </button>
              </div>

              {expanded ? (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                  <div className="text-xs font-semibold text-amber-800">سبب الإعادة</div>
                  <textarea
                    value={notesByItem[item.orderItemId] ?? ''}
                    onChange={(event) => setNotesByItem((state) => ({ ...state, [item.orderItemId]: event.target.value }))}
                    rows={2}
                    placeholder="مثال: القهوة باردة"
                    className="mt-2 w-full rounded-2xl border border-amber-200 bg-white px-3 py-3 text-right"
                  />
                </div>
              ) : null}
            </div>
          );
        })}

        {!items.length ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">{emptyLabel}</div> : null}
      </div>
    </div>
  );
}
