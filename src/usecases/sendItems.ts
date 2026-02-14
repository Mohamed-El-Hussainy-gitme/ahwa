import { Repos } from "@/data/ports";
import { z } from "zod";
import { canSetItemStatus } from "@/domain/state";

const Input = z.object({
  orderId: z.string().min(1),
  itemIds: z.array(z.string().min(1)),
  actorUserId: z.string().min(1),
});

export async function sendItems(repos: Repos, input: unknown) {
  const data = Input.parse(input);
  const items = await repos.items.listByOrder(data.orderId);

  for (const id of data.itemIds) {
    const it = items.find((x) => x.id === id);
    if (!it) continue;
    if (!canSetItemStatus(it.status, "sent")) continue;
    await repos.items.setStatus(id, "sent");
  }

  await repos.events.append({
    actorUserId: data.actorUserId,
    type: "order.items_sent",
    payload: { orderId: data.orderId, itemIds: data.itemIds },
  });

  return true;
}
