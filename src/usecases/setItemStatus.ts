import { Repos } from "@/data/ports";
import { z } from "zod";
import { canSetItemStatus } from "@/domain/state";

const Input = z.object({
  itemId: z.string().min(1),
  to: z.enum(["in_progress", "ready", "served", "cancelled"]),
  actorUserId: z.string().min(1),
});

export async function setItemStatus(repos: Repos, input: unknown) {
  const data = Input.parse(input);

  const item = await repos.items.get(data.itemId);
  if (!item) throw new Error("Item not found");

  if (!canSetItemStatus(item.status, data.to)) {
    throw new Error(`Invalid transition: ${item.status} -> ${data.to}`);
  }

  await repos.items.setStatus(data.itemId, data.to);

  await repos.events.append({
    actorUserId: data.actorUserId,
    type: "item.status_changed",
    payload: { itemId: data.itemId, from: item.status, to: data.to },
  });

  return true;
}
