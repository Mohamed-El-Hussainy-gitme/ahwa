'use client';

import type { ReadyItem } from '@/lib/ops/types';
import { QuantityStepper } from '@/ui/ops/QuantityStepper';
import { parseOrderItemNotes } from '@/lib/ops/orderItemNotes';
import { opsBadge, opsDashed, opsInset, opsSurface } from '@/ui/ops/premiumStyles';

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
      <div className={[opsSurface, 'p-3'].join(' ')}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-[#3d3128]">{title}</div>
          {items.length ? <div className={opsBadge('success')}>{items.length}</div> : null}
        </div>

        {items.length ? (
          <div className="grid grid-cols-2 gap-2">
            {items.map((item) => {
              const quantity = Math.max(1, Math.min(selectedQty[item.orderItemId] ?? 1, item.qtyReadyForDelivery));
              const parsedNotes = parseOrderItemNotes(item.notes);

              return (
                <div key={item.orderItemId} className={[opsInset, 'p-2.5'].join(' ')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 text-right">
                      <div className="truncate text-[10px] font-semibold text-[#8d7967]">{item.sessionLabel}</div>
                      <div className="mt-1 text-sm font-bold leading-5 text-[#1e1712]">{item.productName}</div>
                    </div>

                    <div className="shrink-0 rounded-[16px] bg-[#2e6a4e] px-2 py-1 text-center text-white">
                      <div className="text-[9px] font-semibold text-white/80">جاهز</div>
                      <div className="text-lg font-black leading-none">{item.qtyReadyForDelivery}</div>
                    </div>
                  </div>

                  {item.qtyReadyForReplacementDelivery > 0 ? (
                    <div className="mt-2 rounded-full border border-[#ecd9bd] bg-[#fcf3e7] px-2 py-1 text-center text-[10px] font-semibold text-[#a5671e]">
                      بديل مجاني {item.qtyReadyForReplacementDelivery}
                    </div>
                  ) : null}
                  {parsedNotes.addonSummary ? (
                    <div className="mt-2 rounded-[14px] border border-[#e6d7c4] bg-[#f8f1e6] px-2 py-1 text-right text-[10px] font-semibold text-[#6b4f2a]">
                      إضافات: {parsedNotes.addonSummary}
                    </div>
                  ) : null}
                  {parsedNotes.freeformNotes ? (
                    <div className="mt-2 rounded-[14px] bg-[#fff8ef] px-2 py-1 text-right text-[10px] font-semibold text-[#6b5a4c]">
                      {parsedNotes.freeformNotes}
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
                      className="rounded-[16px] border border-[#dac9b6] bg-[#fffaf3] px-2 py-2 text-xs font-semibold text-[#5e4d3f] disabled:opacity-40"
                    >
                      تسليم
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onDeliver(item.orderItemId, item.qtyReadyForDelivery)}
                      className="rounded-[16px] bg-[#1e1712] px-2 py-2 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      الكل
                    </button>
                  </div>
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
        {items.length ? <div className={opsBadge('success')}>{items.length}</div> : null}
      </div>

      <div className="space-y-3">
        {items.map((item) => {
          const quantity = Math.max(1, Math.min(selectedQty[item.orderItemId] ?? 1, item.qtyReadyForDelivery));
          const parsedNotes = parseOrderItemNotes(item.notes);

          return (
            <div key={item.orderItemId} className={[opsInset, 'p-3'].join(' ')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 text-right">
                  <div className="text-xs font-semibold text-[#8d7967]">{item.sessionLabel}</div>
                  <div className="mt-1 text-base font-bold text-[#1e1712]">{item.productName}</div>
                </div>

                <div className="rounded-[18px] bg-[#2e6a4e] px-3 py-2 text-center text-white">
                  <div className="text-[10px] font-semibold text-white/75">الجاهز</div>
                  <div className="text-xl font-black leading-none">{item.qtyReadyForDelivery}</div>
                </div>
              </div>

              {item.qtyReadyForReplacementDelivery > 0 || parsedNotes.addonSummary ? (
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                  {item.qtyReadyForReplacementDelivery > 0 ? <span className={opsBadge('warning')}>بديل مجاني {item.qtyReadyForReplacementDelivery}</span> : null}
                  {parsedNotes.addonSummary ? <span className={opsBadge('accent')}>إضافات: {parsedNotes.addonSummary}</span> : null}
                </div>
              ) : null}

              {parsedNotes.freeformNotes ? <div className="mt-2 rounded-[16px] bg-[#fff8ef] px-3 py-2 text-right text-xs font-semibold text-[#6b5a4c]">{parsedNotes.freeformNotes}</div> : null}

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
                  className="rounded-[18px] border border-[#dac9b6] bg-[#fffaf3] px-3 py-3 font-semibold text-[#5e4d3f] disabled:opacity-40"
                >
                  تسليم المحدد
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onDeliver(item.orderItemId, item.qtyReadyForDelivery)}
                  className="rounded-[18px] bg-[#1e1712] px-3 py-3 font-semibold text-white disabled:opacity-40"
                >
                  تسليم الكل
                </button>
              </div>
            </div>
          );
        })}

        {!items.length ? <div className={[opsDashed, 'p-3 text-sm text-[#6b5a4c]'].join(' ')}>{emptyLabel}</div> : null}
      </div>
    </div>
  );
}
