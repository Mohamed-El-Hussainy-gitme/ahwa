import { Repos } from "@/data/ports";
import { z } from "zod";

const Input = z.object({
  orderId: z.string().min(1),
  amount: z.number().positive(),
  receivedBy: z.string().min(1),
});

export async function addPayment(repos: Repos, input: unknown) {
  const data = Input.parse(input);

  const p = await repos.billing.addPayment({
    orderId: data.orderId,
    amount: data.amount,
    receivedBy: data.receivedBy,
  });

  await repos.events.append({
    actorUserId: data.receivedBy,
    type: "payment.added",
    payload: { orderId: data.orderId, paymentId: p.id, amount: data.amount },
  });

  return p;
}
