'use client';

import { useState } from 'react';
import type { SessionOrderItem } from '@/lib/ops/types';
import { QuantityStepper } from '@/ui/ops/QuantityStepper';
import { parseOrderItemNotes } from '@/lib/ops/orderItemNotes';
import { opsBadge, opsDashed, opsInset, opsSurface } from '@/ui/ops/premiumStyles';

type Props = {
  title: string;
  items: SessionOrderItem[];
  selectedQty: Record<string, number>;
  onChangeQty: (orderItemId: string, nextQty: number, maxQty: number) => void;
  onRemake: (item: SessionOrderItem, quantity: number, notes?: string) => void | Promise<void>;
  busy: boolean;
  emptyLabel: string;
  compact?: boolean;
};

export function SessionRemakePanel({
  title,
  items,
  selectedQty,
  onChangeQty,
  onRemake,
  busy,
  emptyLabel,
  compact = false,
}: Props) {
  const [expandedByItem, setExpandedByItem] = useState<Record<string, boolean>>({});
  const [notesByItem, setNotesByItem] = useState<Record<string, string>>({});

  async function submitRemake(item: SessionOrderItem, quantity: number) {
    const notes = notesByItem[item.orderItemId]?.trim() || undefined;
    await onRemake(item, quantity, notes);
    setExpandedByItem((state) => ({ ...state, [item.orderItemId]: false }));
    setNotesByItem((state) => ({ ...state, [item.orderItemId]: '' }));
  }

  if (compact) {
    return (
      <div className={[opsSurface, 'p-3'].join(' ')}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-[#3d3128]">{title}</div>
          {items.length ? <div className={opsBadge('warning')}>{items.length}</div> : null}
        </div>

        {items.length ? (
          <div className="grid grid-cols-3 gap-2">
            {items.map((item) => {
              const maxQty = item.availableRemakeQty;
              const quantity = Math.max(1, Math.min(selectedQty[item.orderItemId] ?? 1, Math.max(maxQty, 1)));
              const expanded = Boolean(expandedByItem[item.orderItemId]);
              const parsedNotes = parseOrderItemNotes(item.notes);

              return (
                <div key={item.orderItemId} className={[opsInset, 'p-2'].join(' ')}>
                  <div className="text-right">
                    <div className="truncate text-[10px] font-semibold text-[#8d7967]">{item.sessionLabel}</div>
                    <div className="mt-1 min-h-[2.5rem] text-[13px] font-bold leading-5 text-[#1e1712]">{item.productName}</div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                    <span className={opsBadge('warning')}>إعادة {item.availableRemakeQty}</span>
                    {item.qtyReadyForDelivery > 0 ? <span className={opsBadge('success')}>جاهز {item.qtyReadyForDelivery}</span> : null}
                    {parsedNotes.addonSummary ? <span className={opsBadge('accent')}>إضافات: {parsedNotes.addonSummary}</span> : null}
                  </div>
                  {parsedNotes.freeformNotes ? <div className="mt-2 rounded-[14px] bg-[#fff8ef] px-2 py-1 text-right text-[10px] font-semibold text-[#6b5a4c]">{parsedNotes.freeformNotes}</div> : null}

                  <QuantityStepper
                    compact
                    label="الكمية"
                    value={quantity}
                    onDecrement={() => onChangeQty(item.orderItemId, quantity - 1, Math.max(maxQty, 1))}
                    onIncrement={() => onChangeQty(item.orderItemId, quantity + 1, Math.max(maxQty, 1))}
                  />

                  <div className="mt-2 space-y-2">
                    <button
                      type="button"
                      disabled={busy || maxQty <= 0}
                      onClick={() => void submitRemake(item, quantity)}
                      className="w-full rounded-[16px] bg-[#9b6b2e] px-2 py-2 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      إعادة
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedByItem((state) => ({ ...state, [item.orderItemId]: !expanded }))}
                      className={[
                        'w-full rounded-[16px] border px-2 py-2 text-[11px] font-semibold',
                        expanded ? 'border-[#ead7bc] bg-[#f8ecdb] text-[#7c5222]' : 'border-[#dac9b6] bg-[#fffaf3] text-[#5e4d3f]',
                      ].join(' ')}
                    >
                      {expanded ? 'إخفاء السبب' : 'سبب'}
                    </button>
                  </div>

                  {expanded ? (
                    <div className="mt-2 rounded-[16px] border border-[#ecd9bd] bg-[#fcf3e7] p-2">
                      <textarea
                        value={notesByItem[item.orderItemId] ?? ''}
                        onChange={(event) => setNotesByItem((state) => ({ ...state, [item.orderItemId]: event.target.value }))}
                        rows={2}
                        placeholder="سبب الإعادة"
                        className="w-full rounded-[16px] border border-[#d8c7b3] bg-white px-2 py-2 text-right text-xs"
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className={[opsDashed, 'p-3 text-sm text-[#6b5a4c]'].join(' ')}>{emptyLabel}</div>
        )}
      </div>
    );
  }

  return (
    <div className={[opsSurface, 'p-3'].join(' ')}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-[#3d3128]">{title}</div>
        {items.length ? <div className={opsBadge('warning')}>{items.length}</div> : null}
      </div>

      <div className="space-y-3">
        {items.map((item) => {
          const maxQty = item.availableRemakeQty;
          const quantity = Math.max(1, Math.min(selectedQty[item.orderItemId] ?? 1, Math.max(maxQty, 1)));
          const expanded = Boolean(expandedByItem[item.orderItemId]);
          const parsedNotes = parseOrderItemNotes(item.notes);

          return (
            <div key={item.orderItemId} className={[opsInset, 'p-3'].join(' ')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 text-right">
                  <div className="text-xs font-semibold text-[#8d7967]">{item.sessionLabel}</div>
                  <div className="mt-1 text-base font-bold text-[#1e1712]">{item.productName}</div>
                </div>

                <div className="rounded-[18px] bg-[#9b6b2e] px-3 py-2 text-center text-white">
                  <div className="text-[10px] font-semibold text-white/80">إعادة</div>
                  <div className="text-xl font-black leading-none">{item.availableRemakeQty}</div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                <span className={opsBadge('info')}>تم تسليمه {item.qtyDelivered}</span>
                {item.qtyReadyForDelivery > 0 ? <span className={opsBadge('success')}>جاهز {item.qtyReadyForDelivery}</span> : null}
                {item.qtyReplacementDelivered > 0 ? <span className={opsBadge('warning')}>بديل {item.qtyReplacementDelivered}</span> : null}
                {parsedNotes.addonSummary ? <span className={opsBadge('accent')}>إضافات: {parsedNotes.addonSummary}</span> : null}
              </div>

              {parsedNotes.freeformNotes ? <div className="mt-2 rounded-[16px] bg-[#fff8ef] px-3 py-2 text-right text-xs font-semibold text-[#6b5a4c]">{parsedNotes.freeformNotes}</div> : null}

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
                    'rounded-[18px] border px-3 py-3 text-sm font-semibold',
                    expanded ? 'border-[#ead7bc] bg-[#f8ecdb] text-[#7c5222]' : 'border-[#dac9b6] bg-[#fffaf3] text-[#5e4d3f]',
                  ].join(' ')}
                >
                  {expanded ? 'إخفاء السبب' : 'إضافة سبب'}
                </button>
                <button
                  type="button"
                  disabled={busy || maxQty <= 0}
                  onClick={() => void submitRemake(item, quantity)}
                  className="rounded-[18px] bg-[#9b6b2e] px-3 py-3 font-semibold text-white disabled:opacity-40"
                >
                  إعادة عمل مجانية
                </button>
              </div>

              {expanded ? (
                <div className="mt-3 rounded-[18px] border border-[#ecd9bd] bg-[#fcf3e7] p-3">
                  <div className="text-xs font-semibold text-[#a5671e]">سبب الإعادة</div>
                  <textarea
                    value={notesByItem[item.orderItemId] ?? ''}
                    onChange={(event) => setNotesByItem((state) => ({ ...state, [item.orderItemId]: event.target.value }))}
                    rows={2}
                    placeholder="مثال: القهوة باردة"
                    className="mt-2 w-full rounded-[16px] border border-[#d8c7b3] bg-white px-3 py-3 text-right"
                  />
                </div>
              ) : null}
            </div>
          );
        })}

        {!items.length ? <div className={[opsDashed, 'p-3 text-sm text-[#6b5a4c]'].join(' ')}>{emptyLabel}</div> : null}
      </div>
    </div>
  );
}
