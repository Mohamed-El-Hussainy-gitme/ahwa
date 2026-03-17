import { z } from 'zod';
import { assertPlatformEnv, platformJsonError, platformOk, requirePlatformAdmin } from '@/app/api/platform/_auth';
import { requestSupportAccess } from '@/lib/control-plane/support-access';

const schema = z.object({
  cafeId: z.string().uuid(),
  reason: z.string().trim().min(8).max(500),
  scope: z.enum(['diagnostic', 'read_only', 'guided_write']).default('diagnostic'),
  supportMessageId: z.string().uuid().optional().nullable(),
  durationMinutes: z.coerce.number().int().min(15).max(480).default(60),
});

export async function POST(request: Request) {
  try {
    const session = await requirePlatformAdmin();
    assertPlatformEnv();
    const payload = schema.parse(await request.json());
    const data = await requestSupportAccess({
      superAdminUserId: session.superAdminUserId,
      cafeId: payload.cafeId,
      reason: payload.reason,
      scope: payload.scope,
      supportMessageId: payload.supportMessageId ?? null,
      durationMinutes: payload.durationMinutes,
    });
    return platformOk({ data }, 201);
  } catch (error) {
    return platformJsonError(error);
  }
}
