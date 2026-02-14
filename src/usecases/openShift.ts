import { Repos } from "@/data/ports";
import { z } from "zod";

const Input = z.object({
  kind: z.enum(["morning", "evening"]),
  supervisorUserId: z.string().min(1),
  assignments: z.array(z.object({ userId: z.string().min(1), role: z.enum(["supervisor","waiter","barista","shisha"]) })),
});

export async function openShift(repos: Repos, actorUserId: string, input: unknown) {
  const data = Input.parse(input);
  const shift = await repos.shifts.openShift({
    kind: data.kind,
    supervisorUserId: data.supervisorUserId,
    assignments: data.assignments,
  });

  await repos.events.append({ actorUserId, type: "shift.opened", payload: { shiftId: shift.id } });
  return shift;
}
