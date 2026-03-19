'use client';

import type { ReadyItem } from '@/lib/ops/types';
import { QuantityStepper } from '@/ui/ops/QuantityStepper';

type Props = {
  title: string;
  items: ReadyItem[];
  selectedQty: Record<string, number>;
  onChangeQty: (orderItemId: string, nextQty: number, maxQty: number) => void;
  onDeliver: (orderItemId: string, quantity: number) => void | Promise<void>;
  busy: boolean;
  emptyLabel: string;
  compact?: boolean;
};

export function ReadyDeliveryPanel({
  title,
  items,
  selectedQty,
  onChangeQty,
  onDeliver,
  busy,
  emptyLabel,
  compact = false,
}: Props) {
  if (compact) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-700">{title}</div>
          {items.length ? <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{items.length}</div> : null}
        </div>

        {items.length ? (
          <div className="grid grid-cols-2 gap-2">
            {items.map((item) => {
              const quantity = Math.max(1, Math.min(selectedQty[item.orderItemId] ?? 1, item.qtyReadyForDelivery));

              return (
                <div key={item.orderItemId} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 text-right">
                      <div className="truncate text-[10px] font-semibold text-slate-500">{item.sessionLabel}</div>
                      <div className="mt-1 text-sm font-bold leading-5 text-slate-900">{item.productName}</div>
                    </div>

                    <div className="shrink-0 rounded-2xl bg-emerald-600 px-2 py-1 text-center text-white">
                      <div className="text-[9px] font-semibold text-white/80">جاهز</div>
                      <div className="text-lg font-black leading-none">{item.qtyReadyForDelivery}</div>
                    </div>
                  </div>

                  {item.qtyReadyForReplacementDelivery > 0 ? (
                    <div className="mt-2 rounded-full bg-amber-50 px-2 py-1 text-center text-[10px] font-semibold text-amber-700">
                      بديل مجاني {item.qtyReadyForReplacementDelivery}
                    </div>
                  ) : null}

                  <QuantityStepper
                    compact
                    label="تسليم"
                    value={quantity}
                    onDecrement={() => onChangeQty(item.orderItemId, quantity - 1, item.qtyReadyForDelivery)}
                    onIncrement={() => onChangeQty(item.orderItemId, quantity + 1, item.qtyReadyForDelivery)}
                  />

                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onDeliver(item.orderItemId, quantity)}
                      className="rounded-2xl border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"
                    >
                      تسليم
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onDeliver(item.orderItemId, item.qtyReadyForDelivery)}
                      className="rounded-2xl bg-slate-900 px-2 py-2 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      الكل
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">{emptyLabel}</div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-700">{title}</div>
        {items.length ? <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{items.length}</div> : null}
      </div>

      <div className="space-y-3">
        {items.map((item) => {
          const quantity = Math.max(1, Math.min(selectedQty[item.orderItemId] ?? 1, item.qtyReadyForDelivery));

          return (
            <div key={item.orderItemId} className="rounded-3xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 text-right">
                  <div className="text-xs font-semibold text-slate-500">{item.sessionLabel}</div>
                  <div className="mt-1 text-base font-bold text-slate-900">{item.productName}</div>
                </div>

                <div className="rounded-2xl bg-emerald-600 px-3 py-2 text-center text-white">
                  <div className="text-[10px] font-semibold text-white/75">الجاهز</div>
                  <div className="text-xl font-black leading-none">{item.qtyReadyForDelivery}</div>
                </div>
              </div>

              {item.qtyReadyForReplacementDelivery > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">بديل مجاني {item.qtyReadyForReplacementDelivery}</span>
                </div>
              ) : null}

              <QuantityStepper
                label="تسليم الآن"
                value={quantity}
                onDecrement={() => onChangeQty(item.orderItemId, quantity - 1, item.qtyReadyForDelivery)}
                onIncrement={() => onChangeQty(item.orderItemId, quantity + 1, item.qtyReadyForDelivery)}
              />

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onDeliver(item.orderItemId, quantity)}
                  className="rounded-2xl border border-slate-200 px-3 py-3 font-semibold text-slate-700 disabled:opacity-40"
                >
                  تسليم المحدد
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onDeliver(item.orderItemId, item.qtyReadyForDelivery)}
                  className="rounded-2xl bg-slate-900 px-3 py-3 font-semibold text-white disabled:opacity-40"
                >
                  تسليم الكل
                </button>
              </div>
            </div>
          );
        })}

        {!items.length ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">{emptyLabel}</div> : null}
      </div>
    </div>
  );
}
