import { OrderItemStatus } from "./model";

export function canSetItemStatus(from: OrderItemStatus, to: OrderItemStatus) {
  const allowed: Record<OrderItemStatus, OrderItemStatus[]> = {
    new: ["sent", "cancelled"],
    sent: ["in_progress", "cancelled"],
    in_progress: ["ready", "cancelled"],
    ready: ["served", "cancelled"],
    served: [],
    cancelled: [],
  };
  return allowed[from].includes(to);
}
