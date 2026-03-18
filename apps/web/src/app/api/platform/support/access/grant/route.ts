import { z } from 'zod';
import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import { assertPlatformEnv, platformJsonError, platformOk, requirePlatformAdmin } from '@/app/api/platform/_auth';

const schema = z.object({
  messageId: z.string().uuid(),
  durationHours: z.coerce.number().int().min(1).max(72).default(4),
  note: z.string().trim().max(1000).optional(),
});

type GrantRpcResult = {
  support_access_grant_id?: string;
  support_message_id?: string;
  cafe_id?: string;
  expires_at?: string;
  duration_hours?: number;
};

export async function POST(request: Request) {
  try {
    const session = await requirePlatformAdmin();
    assertPlatformEnv();
    const payload = schema.parse(await request.json());
    const admin = controlPlaneAdmin();

    const { data, error } = await admin.rpc('platform_grant_support_access_from_message', {
      p_super_admin_user_id: session.superAdminUserId,
      p_support_message_id: payload.messageId,
      p_notes: payload.note?.trim() || null,
      p_duration_hours: payload.durationHours,
    });

    if (error) throw error;

    const rpc = (data ?? {}) as GrantRpcResult;

    return platformOk({
      data: {
        supportAccessGrantId: rpc.support_access_grant_id ?? null,
        supportMessageId: rpc.support_message_id ?? payload.messageId,
        cafeId: rpc.cafe_id ?? null,
        expiresAt: rpc.expires_at ?? null,
        durationHours: Number(rpc.duration_hours ?? payload.durationHours),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return platformJsonError(new Error(error.issues[0]?.message ?? 'INVALID_INPUT'), 400);
    }
    return platformJsonError(error);
  }
}
