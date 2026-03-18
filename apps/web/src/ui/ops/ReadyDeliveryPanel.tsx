import type { ReadyItem } from '@/lib/ops/types';

type Props = {
  title: string;
  items: ReadyItem[];
  selectedQty: Record<string, number>;
  onChangeQty: (orderItemId: string, nextQty: number, maxQty: number) => void;
  onDeliver: (orderItemId: string, quantity: number) => void | Promise<void>;
  busy?: boolean;
  isBusy?: (orderItemId: string) => boolean;
  emptyLabel: string;
};

export function ReadyDeliveryPanel({
  title,
  items,
  selectedQty,
  onChangeQty,
  onDeliver,
  busy = false,
  isBusy,
  emptyLabel,
}: Props) {
  return (
    <div className="rounded-2xl border border-slate-200 p-3">
      <div className="mb-2 text-sm font-semibold text-slate-700">{title}</div>
      <div className="space-y-2">
        {items.map((item) => {
          const quantity = Math.max(1, Math.min(selectedQty[item.orderItemId] ?? 1, item.qtyReadyForDelivery));
          const itemBusy = busy || Boolean(isBusy?.(item.orderItemId));
          return (
            <div key={item.orderItemId} className="rounded-2xl border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold">{item.sessionLabel} • {item.productName}</div>
                <div className="flex items-center gap-2">
                  {itemBusy ? (
                    <div className="rounded-xl bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                      جارٍ التثبيت
                    </div>
                  ) : null}
                  {item.qtyReadyForReplacementDelivery > 0 ? (
                    <div className="rounded-xl bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                      يوجد بديل مجاني
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                جاهز للتسليم {item.qtyReadyForDelivery} • أصلي {item.qtyReadyForNormalDelivery} • بديل مجاني {item.qtyReadyForReplacementDelivery}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <button
                  disabled={itemBusy}
                  onClick={() => onChangeQty(item.orderItemId, quantity - 1, item.qtyReadyForDelivery)}
                  className="h-10 w-10 rounded-2xl border border-slate-200 disabled:opacity-40"
                >
                  -
                </button>
                <div className="text-lg font-bold">{quantity}</div>
                <button
                  disabled={itemBusy}
                  onClick={() => onChangeQty(item.orderItemId, quantity + 1, item.qtyReadyForDelivery)}
                  className="h-10 w-10 rounded-2xl bg-slate-900 text-white disabled:opacity-40"
                >
                  +
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  disabled={itemBusy}
                  onClick={() => void onDeliver(item.orderItemId, quantity)}
                  className="rounded-2xl border border-slate-200 px-3 py-3 font-semibold disabled:opacity-40"
                >
                  {itemBusy ? 'جارٍ التثبيت' : 'تسليم المحدد'}
                </button>
                <button
                  disabled={itemBusy}
                  onClick={() => void onDeliver(item.orderItemId, item.qtyReadyForDelivery)}
                  className="rounded-2xl bg-slate-900 px-3 py-3 font-semibold text-white disabled:opacity-40"
                >
                  {itemBusy ? 'جارٍ التثبيت' : 'تسليم الكل'}
                </button>
              </div>
            </div>
          );
        })}
        {!items.length ? <div className="text-sm text-slate-500">{emptyLabel}</div> : null}
      </div>
    </div>
  );
}
