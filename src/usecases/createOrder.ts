import { Repos } from "@/data/ports";
import { z } from "zod";

const Input = z.object({
  tableLabel: z.string().optional(),
  createdBy: z.string().min(1),
});

export async function createOrder(repos: Repos, input: unknown) {
  const data = Input.parse(input);
  const order = await repos.orders.create({ tableLabel: data.tableLabel, createdBy: data.createdBy });

  await repos.events.append({
    actorUserId: data.createdBy,
    type: "order.created",
    payload: { orderId: order.id, table: order.tableLabel ?? null },
  });

  return order;
}
