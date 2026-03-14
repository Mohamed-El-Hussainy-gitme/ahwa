import type { SessionOrderItem } from '@/lib/ops/types';

type Props = {
  title: string;
  items: SessionOrderItem[];
  selectedQty: Record<string, number>;
  onChangeQty: (orderItemId: string, nextQty: number, maxQty: number) => void;
  onRemake: (item: SessionOrderItem, quantity: number) => void | Promise<void>;
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
  return (
    <div className="rounded-2xl border border-slate-200 p-3">
      <div className="mb-2 text-sm font-semibold text-slate-700">{title}</div>
      <div className="space-y-2">
        {items.map((item) => {
          const maxQty = item.availableRemakeQty;
          const quantity = Math.max(1, Math.min(selectedQty[item.orderItemId] ?? 1, Math.max(maxQty, 1)));
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
              <button
                disabled={busy || maxQty <= 0}
                onClick={() => void onRemake(item, quantity)}
                className="mt-3 w-full rounded-2xl bg-amber-600 px-3 py-3 font-semibold text-white disabled:opacity-40"
              >
                إعادة عمل مجانية للمحدد
              </button>
            </div>
          );
        })}
        {!items.length ? <div className="text-sm text-slate-500">{emptyLabel}</div> : null}
      </div>
    </div>
  );
}
