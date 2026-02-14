import { Repos } from "@/data/ports";
import { z } from "zod";

const Input = z.object({
  orderId: z.string().min(1),
  productId: z.string().min(1),
  qty: z.number().int().positive(),
  notes: z.string().optional(),
  actorUserId: z.string().min(1),
});

export async function addItem(repos: Repos, input: unknown) {
  const data = Input.parse(input);
  const product = await repos.products.get(data.productId);
  if (!product) throw new Error("Product not found");

  const item = await repos.items.add({
    orderId: data.orderId,
    productId: data.productId,
    qty: data.qty,
    unitPrice: product.price,
    notes: data.notes,
    assignedTo: product.targetRole,
  });

  await repos.events.append({
    actorUserId: data.actorUserId,
    type: "order.item_added",
    payload: { orderId: data.orderId, itemId: item.id, productId: data.productId, qty: data.qty },
  });

  return item;
}
